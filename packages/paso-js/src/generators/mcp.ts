import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { PasoDeclaration, PasoCapability, PasoInput } from '../types';

/**
 * Generate and return an McpServer from a Paso declaration.
 * Each capability becomes an MCP tool.
 */
export function generateMcpServer(decl: PasoDeclaration): McpServer {
  const server = new McpServer({
    name: decl.service.name,
    version: decl.service.version || '1.0.0',
  });

  const forbidden = new Set(decl.permissions?.forbidden || []);

  for (const cap of decl.capabilities) {
    if (forbidden.has(cap.name)) continue;

    const inputSchema = buildZodSchema(cap);
    const description = buildToolDescription(cap, decl);

    if (inputSchema) {
      server.tool(cap.name, description, inputSchema, async (args) => {
        return await executeCapability(cap, args, decl);
      });
    } else {
      server.tool(cap.name, description, async () => {
        return await executeCapability(cap, {}, decl);
      });
    }
  }

  return server;
}

/**
 * Start the MCP server on stdio transport.
 */
export async function serveMcp(decl: PasoDeclaration): Promise<void> {
  const server = generateMcpServer(decl);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/**
 * Build a Zod schema from a capability's inputs.
 * Returns undefined if the capability has no inputs.
 */
function buildZodSchema(cap: PasoCapability): Record<string, z.ZodTypeAny> | undefined {
  if (!cap.inputs || Object.keys(cap.inputs).length === 0) return undefined;

  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [name, input] of Object.entries(cap.inputs)) {
    let field = inputToZod(input);

    if (!input.required) {
      field = field.optional();
    }

    if (input.description) {
      field = field.describe(input.description);
    }

    shape[name] = field;
  }

  return shape;
}

/**
 * Convert a PasoInput to a Zod type.
 */
function inputToZod(input: PasoInput): z.ZodTypeAny {
  switch (input.type) {
    case 'string':
      return z.string();
    case 'integer':
      return z.number().int();
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'enum':
      if (input.values && input.values.length > 0) {
        const vals = input.values.map((v) => String(v));
        return z.enum(vals as [string, ...string[]]);
      }
      return z.string();
    case 'array':
      return z.array(z.unknown());
    case 'object':
      return z.record(z.string(), z.unknown());
    default:
      return z.unknown();
  }
}

/**
 * Build a rich tool description from the capability and service info.
 */
function buildToolDescription(cap: PasoCapability, _decl: PasoDeclaration): string {
  let desc = cap.description;

  if (cap.consent_required) {
    desc +=
      '\n\n⚠️ REQUIRES USER CONSENT: You must confirm this action with the user before executing.';
  }

  if (cap.constraints && cap.constraints.length > 0) {
    desc += '\n\nConstraints:';
    for (const c of cap.constraints) {
      if (c.description) desc += `\n- ${c.description}`;
      if (c.max_per_hour) desc += `\n- Rate limit: ${c.max_per_hour}/hour`;
      if (c.max_value) desc += `\n- Max value: ${c.max_value}`;
      if (c.max_per_request) desc += `\n- Max per request: ${c.max_per_request}`;
    }
  }

  return desc;
}

/**
 * Execute a capability by making the actual HTTP request to the service.
 */
async function executeCapability(
  cap: PasoCapability,
  args: Record<string, unknown>,
  decl: PasoDeclaration,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // Build the URL
  let path = cap.path;
  const queryParams: Record<string, string> = {};
  const bodyParams: Record<string, unknown> = {};

  if (cap.inputs) {
    for (const [name, input] of Object.entries(cap.inputs)) {
      const value = args[name];
      if (value === undefined) continue;

      const location =
        input.in || (['POST', 'PUT', 'PATCH'].includes(cap.method) ? 'body' : 'query');

      switch (location) {
        case 'path':
          path = path.replace(`{${name}}`, encodeURIComponent(String(value)));
          break;
        case 'query':
          queryParams[name] = String(value);
          break;
        case 'header':
          // Headers handled separately
          break;
        case 'body':
        default:
          bodyParams[name] = value;
          break;
      }
    }
  }

  const url = new URL(path, decl.service.base_url);
  for (const [k, v] of Object.entries(queryParams)) {
    url.searchParams.set(k, v);
  }

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (decl.service.auth) {
    // Auth token comes from environment variable: USEPASO_AUTH_TOKEN
    const token = process.env.USEPASO_AUTH_TOKEN;
    if (token) {
      const authHeader = decl.service.auth.header || 'Authorization';
      const prefix =
        decl.service.auth.prefix ?? (decl.service.auth.type === 'bearer' ? 'Bearer' : '');
      headers[authHeader] = prefix ? `${prefix} ${token}` : token;
    }
  }

  // Add any header-type inputs
  if (cap.inputs) {
    for (const [name, input] of Object.entries(cap.inputs)) {
      if (input.in === 'header' && args[name] !== undefined) {
        headers[name] = String(args[name]);
      }
    }
  }

  try {
    const fetchOptions: RequestInit = {
      method: cap.method,
      headers,
    };

    if (['POST', 'PUT', 'PATCH'].includes(cap.method) && Object.keys(bodyParams).length > 0) {
      fetchOptions.body = JSON.stringify(bodyParams);
    }

    const response = await fetch(url.toString(), fetchOptions);
    const text = await response.text();

    let result: string;
    try {
      const json = JSON.parse(text);
      result = JSON.stringify(json, null, 2);
    } catch {
      result = text;
    }

    if (!response.ok) {
      return {
        content: [{ type: 'text', text: `Error ${response.status}: ${result}` }],
      };
    }

    return {
      content: [{ type: 'text', text: result }],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Request failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
