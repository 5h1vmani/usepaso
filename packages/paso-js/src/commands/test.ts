import { Command } from 'commander';
import { resolve } from 'path';
import { loadAndValidate } from './shared';
import { buildRequest, executeRequest, formatError } from '../executor';
import { coerceValue } from '../utils/coerce';
import { green, cyan, dim } from '../utils/color';

export function registerTest(program: Command): void {
  program
    .command('test [capability]')
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
    .option('--all', 'Test all capabilities (requires --dry-run)')
    .option('--timeout <seconds>', 'Request timeout in seconds', '30')
    .action(async (capabilityName, opts) => {
      try {
        const decl = loadAndValidate(resolve(opts.file));

        // --all mode: dry-run all capabilities
        if (opts.all) {
          if (!opts.dryRun) {
            console.error(
              '--all requires --dry-run. Running all capabilities against a live API is not supported.',
            );
            process.exit(1);
          }
          const authToken = process.env.USEPASO_AUTH_TOKEN;
          let passed = 0;
          let failed = 0;
          for (const cap of decl.capabilities) {
            const args: Record<string, unknown> = {};
            if (cap.inputs) {
              for (const [name, input] of Object.entries(cap.inputs)) {
                if (input.default !== undefined) {
                  args[name] = input.default;
                } else if (input.required) {
                  args[name] =
                    input.type === 'integer' ? 0 : input.type === 'boolean' ? false : `{${name}}`;
                }
              }
            }
            try {
              const req = buildRequest(cap, args, decl, authToken);
              console.log(`${green('ok')} ${cyan(cap.name)} ${dim(`${req.method} ${req.url}`)}`);
              passed++;
            } catch (e) {
              console.error(`FAIL ${cap.name}: ${e instanceof Error ? e.message : e}`);
              failed++;
            }
          }
          console.log('');
          console.log(
            `${passed} passed${failed > 0 ? `, ${failed} failed` : ''}. ${decl.capabilities.length} capabilities total.`,
          );
          if (failed > 0) process.exit(1);
          return;
        }

        // No capability specified — list available ones
        if (!capabilityName) {
          console.log('Missing capability name. Available capabilities:\n');
          for (const c of decl.capabilities) {
            console.log(`  ${cyan(c.name)} ${dim(`(${c.permission})`)}  ${dim(c.description)}`);
          }
          console.log(`\nUsage: usepaso test <capability> [--param key=value]`);
          return;
        }

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
          console.log(dim('--- DRY RUN (no request will be made) ---'));
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

        console.log(`Testing ${cyan(cap.name)}...`);
        console.log(dim(`→ ${req.method} ${req.url}`));
        if (req.body) console.log(`→ Body: ${req.body}`);
        console.log('');

        const timeoutMs = Math.round(parseFloat(opts.timeout) * 1000);
        const result = await executeRequest(req, { timeout: timeoutMs });

        if (result.error) {
          console.error(formatError(result, decl, authToken));
          process.exit(1);
        }

        console.log(
          green(`← ${result.status} ${result.statusText}`) + dim(` (${result.durationMs}ms)`),
        );
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
