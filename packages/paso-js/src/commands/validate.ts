import { Command } from 'commander';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { parseFile } from '../parser';
import { validate } from '../validator';
import { loadAndValidate } from './shared';
import { green, cyan, yellow, dim } from '../utils/color';
import { PasoDeclaration } from '../types';

/**
 * Run best-practice checks beyond basic validation.
 * Returns an array of warning strings.
 */
function strictChecks(decl: PasoDeclaration): string[] {
  const warnings: string[] = [];
  for (const cap of decl.capabilities) {
    if (cap.method === 'DELETE' && !cap.consent_required) {
      warnings.push(
        `${cap.name}: DELETE without consent_required — agents could delete data without user approval`,
      );
    }
    if (cap.description && cap.description.length < 10) {
      warnings.push(
        `${cap.name}: description is very short (${cap.description.length} chars) — agents need clear descriptions to use tools correctly`,
      );
    }
    if (['write', 'admin'].includes(cap.permission || '') && !cap.constraints?.length) {
      warnings.push(
        `${cap.name}: ${cap.permission} capability with no constraints — consider adding rate limits or guardrails`,
      );
    }
  }
  if (!decl.permissions) {
    warnings.push('No permissions section defined — all capabilities are accessible by default');
  }
  return warnings;
}

export function registerValidate(program: Command): void {
  program
    .command('validate')
    .description('Validate a usepaso.yaml file')
    .option('-f, --file <path>', 'Path to usepaso.yaml', 'usepaso.yaml')
    .option('--json', 'Output result as JSON')
    .option('--strict', 'Enable best-practice checks')
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

          const allWarnings = warnings.map((e) => ({ path: e.path, message: e.message }));
          const bp = opts.strict && valid ? strictChecks(decl) : [];
          for (const w of bp) allWarnings.push({ path: 'strict', message: w });

          console.log(
            JSON.stringify({
              valid: valid && bp.length === 0,
              service: decl.service?.name || null,
              capabilities: decl.capabilities?.length || 0,
              errors: errors.map((e) => ({ path: e.path, message: e.message })),
              warnings: allWarnings,
            }),
          );
          if (!valid) process.exit(1);
          if (bp.length > 0) process.exit(1);
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
        console.log(
          `${green('valid')} (${cyan(decl.service.name)}, ${decl.capabilities.length} capabilities, 0 regrets)`,
        );

        if (opts.strict) {
          const bp = strictChecks(decl);
          if (bp.length > 0) {
            console.log('');
            console.log(yellow(`${bp.length} best-practice warning(s):`));
            for (const w of bp) {
              console.log(dim(`  → ${w}`));
            }
            process.exit(1);
          }
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });
}
