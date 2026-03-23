import { Command } from 'commander';
import { resolve } from 'path';
import { loadAndValidate } from './shared';
import { buildRequest, executeRequest, formatError } from '../executor';

export function registerTest(program: Command): void {
  program
    .command('test <capability>')
    .description('Test a capability by making the actual HTTP request (or --dry-run to preview)')
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
    .action(async (capabilityName, opts) => {
      try {
        const decl = loadAndValidate(resolve(opts.file));

        const cap = decl.capabilities.find((c) => c.name === capabilityName);
        if (!cap) {
          console.error(`Capability "${capabilityName}" not found.`);
          console.error(`Available: ${decl.capabilities.map((c) => c.name).join(', ')}`);
          process.exit(1);
        }

        // Parse params
        const args: Record<string, unknown> = {};
        for (const p of opts.param) {
          const eq = p.indexOf('=');
          if (eq === -1) {
            console.error(`Invalid param format: "${p}". Use key=value.`);
            process.exit(1);
          }
          const key = p.slice(0, eq);
          let value: unknown = p.slice(eq + 1);
          if (value === 'true') value = true;
          else if (value === 'false') value = false;
          else if (!isNaN(Number(value)) && value !== '') value = Number(value);
          args[key] = value;
        }

        // Check for missing required params
        if (cap.inputs) {
          for (const [name, input] of Object.entries(cap.inputs)) {
            if (input.required && !(name in args)) {
              console.error(`Missing required parameter: ${name} (${input.description})`);
              process.exit(1);
            }
          }
        }

        const req = buildRequest(cap, args, decl);

        if (opts.dryRun) {
          console.log('--- DRY RUN (no request will be made) ---');
          console.log('');
          console.log(`${req.method} ${req.url}`);
          for (const [k, v] of Object.entries(req.headers)) {
            const display = k.toLowerCase() === 'authorization' ? `${v.slice(0, 12)}...` : v;
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

        const result = await executeRequest(req);

        if (result.error) {
          console.error(formatError(result, decl));
          process.exit(1);
        }

        console.log(`← ${result.status} ${result.statusText} (${result.durationMs}ms)`);
        console.log('');

        if (result.status && result.status >= 400) {
          console.error(formatError(result, decl));
          process.exit(1);
        }

        console.log(result.body);
      } catch (err) {
        console.error(`Failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });
}
