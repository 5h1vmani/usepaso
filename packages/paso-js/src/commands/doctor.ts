import { Command } from 'commander';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { parseFile } from '../parser';
import { validate } from '../validator';
import { green, red, cyan, dim } from '../utils/color';

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Check your usepaso setup for common issues')
    .option('-f, --file <path>', 'Path to usepaso.yaml', 'usepaso.yaml')
    .action(async (opts) => {
      const filePath = resolve(opts.file);
      let failed = 0;

      function ok(label: string, detail?: string) {
        const suffix = detail ? ` ${dim(`(${detail})`)}` : '';
        console.log(`  ${green('ok')}   ${label}${suffix}`);
      }

      function fail(label: string, hint: string) {
        console.log(`  ${red('FAIL')} ${label}`);
        console.log(`  ${dim('│')}    ${dim(hint)}`);
        failed++;
      }

      console.log('');
      console.log(cyan('usepaso doctor'));
      console.log('');

      // 1. File exists
      if (!existsSync(filePath)) {
        fail('usepaso.yaml found', `Run usepaso init to create one.`);
        console.log('');
        console.log(`${failed} check failed.`);
        process.exit(1);
      }
      ok('usepaso.yaml found');

      // 2. YAML parses
      let decl;
      try {
        decl = parseFile(filePath);
        ok('YAML parses correctly');
      } catch (err) {
        fail('YAML parses correctly', err instanceof Error ? err.message : String(err));
        console.log('');
        console.log(`${failed} check(s) failed.`);
        process.exit(1);
      }

      // 3. Validation
      const results = validate(decl);
      const errors = results.filter((e) => e.level !== 'warning');
      const warnings = results.filter((e) => e.level === 'warning');
      if (errors.length > 0) {
        fail('Validation passes', `${errors.length} error(s). Run usepaso validate for details.`);
      } else {
        const warnSuffix = warnings.length > 0 ? `, ${warnings.length} warning(s)` : '';
        ok('Validation passes', `${decl.capabilities.length} capabilities${warnSuffix}`);
      }

      // 4. Auth token
      const authType = decl.service?.auth?.type;
      const token = process.env.USEPASO_AUTH_TOKEN;
      if (authType && authType !== 'none') {
        if (token) {
          if (token === '') {
            fail('USEPASO_AUTH_TOKEN set', 'Token is empty. Set a valid token.');
          } else {
            ok('USEPASO_AUTH_TOKEN set');
          }
        } else {
          fail('USEPASO_AUTH_TOKEN set', 'Set it with: export USEPASO_AUTH_TOKEN=your-token');
        }
      } else {
        ok('Auth', 'type is "none", no token needed');
      }

      // 5. Base URL reachable
      const baseUrl = decl.service?.base_url;
      if (baseUrl) {
        try {
          const start = Date.now();
          await fetch(baseUrl, {
            method: 'HEAD',
            signal: AbortSignal.timeout(5000),
          });
          const ms = Date.now() - start;
          ok('Base URL reachable', `${baseUrl}, ${ms}ms`);
        } catch {
          fail('Base URL reachable', `Could not reach ${baseUrl}. Check the URL and your network.`);
        }
      }

      console.log('');
      console.log(dim('─'.repeat(40)));
      if (failed === 0) {
        console.log(green('All checks passed.'));
      } else {
        console.log(`${red(String(failed))} check(s) failed.`);
        process.exit(1);
      }
    });
}
