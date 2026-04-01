import { randomBytes } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { PasoDeclaration, PasoCapability, PasoInput } from '../types';
import { buildRequest, executeRequest, ExecutionResult, formatStructuredError } from '../executor';

export type LogCallback = (capName: string, result: ExecutionResult) => void;

export interface ServeOptions {
  onLog?: LogCallback;
  strict?: boolean;
}

export interface McpServerResult {
  server: McpServer;
  toolNames: string[];
}

// --- Constraint enforcement (always on) ---

const rateLimitCounters = new Map<string, { timestamps: number[] }>();

function checkConstraints(cap: PasoCapability, args: Record<string, unknown>): string | null {
  if (!cap.constraints || cap.constraints.length === 0) return null;

  const now = Date.now();
  const windowMs = 60 * 60 * 1000;

  // Pass 1: validate all constraints (no side effects)
  for (const constraint of cap.constraints) {
    if (constraint.max_per_hour) {
      const entry = rateLimitCounters.get(cap.name);
      if (entry) {
        const recent = entry.timestamps.filter((t) => now - t < windowMs);
        if (recent.length >= constraint.max_per_hour) {
          const retryAfter = Math.ceil((recent[0] + windowMs - now) / 1000);
          return `Rate limit exceeded for "${cap.name}": max ${constraint.max_per_hour} calls per hour. Retry after ${retryAfter} seconds.`;
        }
      }
    }

    if (constraint.max_value !== undefined) {
      for (const [name, value] of Object.entries(args)) {
        if (typeof value === 'number' && value > constraint.max_value) {
          return `Constraint violated for "${cap.name}": input "${name}" value ${value} exceeds maximum of ${constraint.max_value}.`;
        }
      }
    }

    if (constraint.max_per_request !== undefined) {
      for (const [name, value] of Object.entries(args)) {
        if (Array.isArray(value) && value.length > constraint.max_per_request) {
          return `Constraint violated for "${cap.name}": input "${name}" has ${value.length} items, max is ${constraint.max_per_request}.`;
        }
      }
    }
  }

  // Pass 2: all constraints passed, now record the rate limit timestamp
  for (const constraint of cap.constraints) {
    if (constraint.max_per_hour) {
      let entry = rateLimitCounters.get(cap.name);
      if (!entry) {
        entry = { timestamps: [] };
        rateLimitCounters.set(cap.name, entry);
      }
      entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
      entry.timestamps.push(now);
      break; // only one rate limit per capability
    }
  }

  return null;
}

// --- Consent enforcement (strict mode only) ---

const CONSENT_TOKEN_TTL_MS = 300_000;
const pendingConsents = new Map<string, { token: string; argsHash: string; expires: number }>();

function formatConsentArgs(args: Record<string, unknown>): string {
  const parts = Object.entries(args)
    .filter(([k]) => k !== '__confirm')
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
  return parts.length > 0 ? `(${parts.join(', ')})` : '()';
}

function hashArgs(args: Record<string, unknown>): string {
  const clean = Object.entries(args)
    .filter(([k]) => k !== '__confirm')
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(clean);
}

function handleConsent(
  cap: PasoCapability,
  args: Record<string, unknown>,
  strict: boolean,
): {
  execute: boolean;
  logMessage?: string;
  response?: { content: { type: 'text'; text: string }[] };
} {
  if (!cap.consent_required) return { execute: true };

  const argsDisplay = formatConsentArgs(args);

  // Advisory mode: return log message, execute
  if (!strict) {
    return { execute: true, logMessage: `[CONSENT] ${cap.name}${argsDisplay} executed` };
  }

  // Strict mode: two-phase confirmation
  const confirmToken = args.__confirm as string | undefined;
  const pending = pendingConsents.get(cap.name);

  if (confirmToken && pending) {
    if (Date.now() > pending.expires) {
      pendingConsents.delete(cap.name);
      return {
        execute: false,
        response: {
          content: [
            {
              type: 'text' as const,
              text: `Confirmation token for "${cap.name}" has expired. Call this tool again without __confirm to get a new token.`,
            },
          ],
        },
      };
    }
    if (confirmToken === pending.token && hashArgs(args) === pending.argsHash) {
      pendingConsents.delete(cap.name);
      return {
        execute: true,
        logMessage: `[CONSENT] ${cap.name}${argsDisplay} confirmed and executed`,
      };
    }
    pendingConsents.delete(cap.name);
    return {
      execute: false,
      response: {
        content: [
          {
            type: 'text' as const,
            text: `Invalid confirmation: token or arguments do not match the original request. Call "${cap.name}" again without __confirm to get a new token.`,
          },
        ],
      },
    };
  }

  // First call: issue a consent challenge bound to these specific args
  const token = randomBytes(16).toString('hex');
  pendingConsents.set(cap.name, {
    token,
    argsHash: hashArgs(args),
    expires: Date.now() + CONSENT_TOKEN_TTL_MS,
  });

  return {
    execute: false,
    response: {
      content: [
        {
          type: 'text' as const,
          text: [
            `This action requires confirmation.`,
            ``,
            `Action: ${cap.name}${argsDisplay}`,
            `Description: ${cap.description}`,
            `Method: ${cap.method} ${cap.path}`,
            ``,
            `To proceed, call this tool again with the same arguments and __confirm: "${token}"`,
            `This token expires in 5 minutes.`,
          ].join('\n'),
        },
      ],
    },
  };
}

/**
 * Generate and return an McpServer from a Paso declaration.
 * Each capability becomes an MCP tool.
 */
export function generateMcpServer(decl: PasoDeclaration, options?: ServeOptions): McpServerResult {
  const resolved: ServeOptions = options ?? {};

  const server = new McpServer({
    name: decl.service.name,
    version: decl.service.version || '1.0.0',
  });

  const onLog = resolved.onLog;
  const strict = resolved.strict ?? false;
  const forbidden = new Set(decl.permissions?.forbidden || []);
  const toolNames: string[] = [];

  // Clear state for fresh server
  rateLimitCounters.clear();
  pendingConsents.clear();

  for (const cap of decl.capabilities) {
    if (forbidden.has(cap.name)) continue;
    toolNames.push(cap.name);

    const inputSchema = buildZodSchema(cap, strict);
    const description = buildToolDescription(cap);

    const handler = async (args: Record<string, unknown>) => {
      // 1. Check constraints (always enforced)
      const constraintError = checkConstraints(cap, args);
      if (constraintError) {
        return {
          content: [{ type: 'text' as const, text: constraintError }],
        };
      }

      // 2. Check consent (advisory or strict)
      const consent = handleConsent(cap, args, strict);
      if (!consent.execute) {
        return consent.response!;
      }
      if (consent.logMessage) {
        console.error(consent.logMessage);
      }

      // 3. Execute the request
      const cleanArgs = { ...args };
      delete cleanArgs.__confirm;

      // Apply defaults for missing optional inputs
      if (cap.inputs) {
        for (const [name, input] of Object.entries(cap.inputs)) {
          if (!(name in cleanArgs) && input.default !== undefined) {
            cleanArgs[name] = input.default;
          }
        }
      }

      const authToken = process.env.USEPASO_AUTH_TOKEN;
      const req = buildRequest(cap, cleanArgs, decl, authToken);
      const result = await executeRequest(req);

      if (onLog) onLog(cap.name, result);

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

  return { server, toolNames };
}

/**
 * Start the MCP server on stdio transport.
 */
export async function serveMcp(decl: PasoDeclaration, options?: ServeOptions): Promise<void> {
  const { server } = generateMcpServer(decl, options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/**
 * Build a Zod schema from a capability's inputs.
 */
function buildZodSchema(
  cap: PasoCapability,
  strict?: boolean,
): Record<string, z.ZodTypeAny> | undefined {
  const hasInputs = cap.inputs && Object.keys(cap.inputs).length > 0;
  const needsConfirm = strict && cap.consent_required;

  if (!hasInputs && !needsConfirm) return undefined;

  const shape: Record<string, z.ZodTypeAny> = {};

  if (cap.inputs) {
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
  }

  // In strict mode, consent-gated tools get a __confirm param
  if (needsConfirm) {
    shape.__confirm = z
      .string()
      .optional()
      .describe('Confirmation token (provided by the server after first call)');
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

function buildToolDescription(cap: PasoCapability): string {
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
