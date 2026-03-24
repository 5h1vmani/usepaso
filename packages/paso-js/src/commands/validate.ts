import { Command } from 'commander';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { parseFile } from '../parser';
import { validate } from '../validator';
import { loadAndValidate } from './shared';

export function registerValidate(program: Command): void {
  program
    .command('validate')
    .description('Validate a usepaso.yaml file')
    .option('-f, --file <path>', 'Path to usepaso.yaml', 'usepaso.yaml')
    .option('--json', 'Output result as JSON')
    .action((opts) => {
      const filePath = resolve(opts.file);

      if (opts.json) {
        // JSON mode: capture everything as structured data
        if (!existsSync(filePath)) {
          console.log(
            JSON.stringify({
              valid: false,
              service: null,
              capabilities: 0,
              errors: [{ path: '', message: `File not found: ${filePath}` }],
              warnings: [],
            }),
          );
          process.exit(1);
        }
        try {
          const decl = parseFile(filePath);
          const results = validate(decl);
          const errors = results.filter((e) => e.level !== 'warning');
          const warnings = results.filter((e) => e.level === 'warning');
          const valid = errors.length === 0;

          console.log(
            JSON.stringify({
              valid,
              service: decl.service?.name || null,
              capabilities: decl.capabilities?.length || 0,
              errors: errors.map((e) => ({ path: e.path, message: e.message })),
              warnings: warnings.map((e) => ({ path: e.path, message: e.message })),
            }),
          );
          if (!valid) process.exit(1);
        } catch (err) {
          console.log(
            JSON.stringify({
              valid: false,
              service: null,
              capabilities: 0,
              errors: [{ path: '', message: err instanceof Error ? err.message : String(err) }],
              warnings: [],
            }),
          );
          process.exit(1);
        }
        return;
      }

      // Normal mode
      try {
        const decl = loadAndValidate(filePath);
        console.log(`valid (${decl.service.name}, ${decl.capabilities.length} capabilities)`);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });
}
