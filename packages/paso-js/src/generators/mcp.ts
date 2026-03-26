import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { PasoDeclaration, PasoCapability, PasoInput } from '../types';
import { buildRequest, executeRequest, ExecutionResult, formatStructuredError } from '../executor';

export type LogCallback = (capName: string, result: ExecutionResult, decl: PasoDeclaration) => void;

/**
 * Generate and return an McpServer from a Paso declaration.
 * Each capability becomes an MCP tool.
 */
export function generateMcpServer(decl: PasoDeclaration, onLog?: LogCallback): McpServer {
  const server = new McpServer({
    name: decl.service.name,
    version: decl.service.version || '1.0.0',
  });

  const forbidden = new Set(decl.permissions?.forbidden || []);

  for (const cap of decl.capabilities) {
    if (forbidden.has(cap.name)) continue;

    const inputSchema = buildZodSchema(cap);
    const description = buildToolDescription(cap, decl);

    const handler = async (args: Record<string, unknown>) => {
      const authToken = process.env.USEPASO_AUTH_TOKEN;
      const req = buildRequest(cap, args, decl, authToken);
      const result = await executeRequest(req);

      if (onLog) onLog(cap.name, result, decl);

      if (result.error || (result.status && result.status >= 400)) {
        const structured = formatStructuredError(result, decl, authToken);
        const text = result.body
          ? `${JSON.stringify(structured)}\n\nResponse body:\n${result.body}`
          : JSON.stringify(structured);
        return {
          content: [{ type: 'text' as const, text }],
        };
      }

      return {
        content: [{ type: 'text' as const, text: result.body }],
      };
    };

    if (inputSchema) {
      server.tool(cap.name, description, inputSchema, async (args) => handler(args));
    } else {
      server.tool(cap.name, description, async () => handler({}));
    }
  }

  return server;
}

/**
 * Start the MCP server on stdio transport.
 */
export async function serveMcp(decl: PasoDeclaration, onLog?: LogCallback): Promise<void> {
  const server = generateMcpServer(decl, onLog);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/**
 * Build a Zod schema from a capability's inputs.
 */
function buildZodSchema(cap: PasoCapability): Record<string, z.ZodTypeAny> | undefined {
  if (!cap.inputs || Object.keys(cap.inputs).length === 0) return undefined;

  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [name, input] of Object.entries(cap.inputs)) {
    let field = inputToZod(input);

    if (!input.required) {
      if (input.default !== undefined) {
        field = field.optional().default(input.default);
      } else {
        field = field.optional();
      }
    }

    if (input.description) {
      field = field.describe(input.description);
    }

    shape[name] = field;
  }

  return shape;
}

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
        const allStrings = input.values.every((v) => typeof v === 'string');
        if (allStrings) {
          return z.enum(input.values as [string, ...string[]]);
        }
        // Mixed or numeric enums: use z.literal / z.union to preserve types
        const literals = input.values.map((v) => z.literal(v as string | number | boolean));
        if (literals.length === 1) return literals[0];
        return z.union(literals as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
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

function buildToolDescription(cap: PasoCapability, _decl: PasoDeclaration): string {
  let desc = cap.description;

  desc += `\n\n[Permission: ${cap.permission}] [${cap.method} ${cap.path}]`;

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
      if (c.requires_field) desc += `\n- Required: ${c.requires_field} must be provided`;
    }
  }

  return desc;
}
