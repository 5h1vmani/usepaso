import { Command } from 'commander';
import { resolve } from 'path';
import { loadAndValidate } from './shared';
import { buildRequest, executeRequest, formatError } from '../executor';

const INTEGER_RE = /^-?\d+$/;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;

export function coerceValue(raw: string, type: string, key: string): unknown {
  switch (type) {
    case 'integer': {
      if (!INTEGER_RE.test(raw)) {
        throw new Error(`Parameter "${key}" must be an integer, got "${raw}"`);
      }
      return parseInt(raw, 10);
    }
    case 'number': {
      if (!NUMBER_RE.test(raw)) {
        throw new Error(`Parameter "${key}" must be a number, got "${raw}"`);
      }
      return parseFloat(raw);
    }
    case 'boolean':
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      throw new Error(`Parameter "${key}" must be true or false, got "${raw}"`);
    case 'string':
    case 'enum':
      return raw;
    default:
      return raw;
  }
}

export function registerTest(program: Command): void {
  program
    .command('test <capability>')
    .description('Test a capability against the live API (or --dry-run, minus the consequences)')
    .option('-f, --file <path>', 'Path to usepaso.yaml', 'usepaso.yaml')
    .option(
      '-p, --param <key=value...>',
      'Parameters (repeatable)',
      (val: string, acc: string[]) => {
        acc.push(val);
        return acc;
      },
      [],
    )
    .option('--dry-run', 'Show the HTTP request without executing it')
    .option('--timeout <seconds>', 'Request timeout in seconds', '30')
    .action(async (capabilityName, opts) => {
      try {
        const decl = loadAndValidate(resolve(opts.file));

        // Auth notices (once, not per-request)
        const authToken = process.env.USEPASO_AUTH_TOKEN;
        if (decl.service.auth?.type === 'none' && authToken) {
          console.error(`Note: auth.type is "none" — ignoring USEPASO_AUTH_TOKEN`);
        }
        if (authToken !== undefined && authToken === '') {
          console.error(
            `Warning: USEPASO_AUTH_TOKEN is set but empty. API requests will likely fail.`,
          );
        }

        const cap = decl.capabilities.find((c) => c.name === capabilityName);
        if (!cap) {
          console.error(`Capability "${capabilityName}" not found.`);
          console.error(`Available: ${decl.capabilities.map((c) => c.name).join(', ')}`);
          process.exit(1);
        }

        // Parse params using declared input types
        const args: Record<string, unknown> = {};
        const paramErrors: string[] = [];
        for (const p of opts.param) {
          const eq = p.indexOf('=');
          if (eq === -1) {
            paramErrors.push(`Invalid param format: "${p}". Use key=value.`);
            continue;
          }
          const key = p.slice(0, eq);
          const raw = p.slice(eq + 1);
          const inputDef = cap.inputs?.[key];

          if (inputDef) {
            try {
              args[key] = coerceValue(raw, inputDef.type, key);
            } catch (e) {
              paramErrors.push(e instanceof Error ? e.message : String(e));
            }
          } else {
            // Unknown param — keep as string but warn
            args[key] = raw;
            console.error(
              `Warning: unknown parameter "${key}" — not declared in inputs for ${capabilityName}`,
            );
          }
        }

        // Check for missing required params
        if (cap.inputs) {
          for (const [name, input] of Object.entries(cap.inputs)) {
            if (input.required && !(name in args)) {
              paramErrors.push(`Missing required parameter: ${name} (${input.description})`);
            }
          }
        }

        if (paramErrors.length > 0) {
          for (const err of paramErrors) console.error(err);
          process.exit(1);
        }

        const req = buildRequest(cap, args, decl, authToken);

        if (opts.dryRun) {
          console.log('--- DRY RUN (no request will be made) ---');
          console.log('');
          console.log(`${req.method} ${req.url}`);
          const token = authToken;
          for (const [k, v] of Object.entries(req.headers)) {
            const display =
              token && token.length >= 8 && v.includes(token) ? `${v.slice(0, 12)}...` : v;
            console.log(`${k}: ${display}`);
          }
          if (req.body) {
            console.log('');
            console.log(req.body);
          }
          return;
        }

        console.log(`Testing ${cap.name}...`);
        console.log(`→ ${req.method} ${req.url}`);
        if (req.body) console.log(`→ Body: ${req.body}`);
        console.log('');

        const timeoutMs = Math.round(parseFloat(opts.timeout) * 1000);
        const result = await executeRequest(req, { timeout: timeoutMs });

        if (result.error) {
          console.error(formatError(result, decl, authToken));
          process.exit(1);
        }

        console.log(`← ${result.status} ${result.statusText} (${result.durationMs}ms)`);
        console.log('');

        if (result.status && result.status >= 400) {
          console.error(formatError(result, decl, authToken));
          process.exit(1);
        }

        console.log(result.body);
      } catch (err) {
        console.error(`Failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });
}
