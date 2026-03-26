import { Command } from 'commander';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { parseFile } from '../parser';
import { validate } from '../validator';
import { loadAndValidate } from './shared';
import { cyan, dim } from '../utils/color';

export function registerInspect(program: Command): void {
  program
    .command('inspect')
    .description('Show what MCP tools would be generated (dry run)')
    .option('-f, --file <path>', 'Path to usepaso.yaml', 'usepaso.yaml')
    .option('--json', 'Output result as JSON')
    .action((opts) => {
      const filePath = resolve(opts.file);

      if (opts.json) {
        // JSON mode: handle errors as JSON, not stderr
        if (!existsSync(filePath)) {
          console.log(JSON.stringify({ error: `File not found: ${filePath}` }));
          process.exit(1);
        }
        let decl;
        try {
          decl = parseFile(filePath);
          const results = validate(decl);
          const errors = results.filter((e) => e.level !== 'warning');
          if (errors.length > 0) {
            console.log(
              JSON.stringify({
                error: `Validation failed`,
                errors: errors.map((e) => ({ path: e.path, message: e.message })),
              }),
            );
            process.exit(1);
          }
        } catch (err) {
          console.log(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          process.exit(1);
        }

        const forbidden = new Set(decl.permissions?.forbidden || []);
        const tools = decl.capabilities.filter((c) => !forbidden.has(c.name));

        console.log(
          JSON.stringify({
            service: decl.service.name,
            auth: decl.service.auth?.type || 'none',
            tools: tools.map((t) => ({
              name: t.name,
              permission: t.permission,
              method: t.method,
              path: t.path,
              description: t.description,
              consent_required: t.consent_required || false,
              params: t.inputs
                ? Object.entries(t.inputs).map(
                    ([k, v]) => `${k}${v.required ? '*' : ''}: ${v.type}`,
                  )
                : [],
            })),
            forbidden: decl.permissions?.forbidden || [],
          }),
        );
        return;
      }

      // Normal mode
      try {
        const decl = loadAndValidate(filePath);

        const forbidden = new Set(decl.permissions?.forbidden || []);
        const tools = decl.capabilities.filter((c) => !forbidden.has(c.name));

        console.log(`Service: ${cyan(decl.service.name)}`);
        console.log(`Tools:   ${tools.length}`);
        console.log(`Auth:    ${decl.service.auth?.type || 'none'}`);
        console.log('');

        for (let i = 0; i < tools.length; i++) {
          const tool = tools[i];
          const isLast = i === tools.length - 1;
          const connector = i === 0 ? '┌' : isLast ? '└' : '├';
          const cont = isLast ? ' ' : '│';
          const badge = tool.consent_required ? ' [consent required]' : '';
          console.log(
            `  ${dim(connector)} ${cyan(tool.name)} ${dim(`(${tool.permission})`)}${badge}`,
          );
          console.log(`  ${dim(cont)} ${dim(`${tool.method} ${tool.path}`)}`);
          console.log(`  ${dim(cont)} ${tool.description}`);
          if (tool.inputs) {
            const params = Object.entries(tool.inputs)
              .map(([k, v]) => `${k}${v.required ? '*' : ''}: ${v.type}`)
              .join(', ');
            console.log(`  ${dim(cont)} params: ${params}`);
          }
          if (!isLast) console.log(`  ${dim('│')}`);
        }
        console.log('');

        if (decl.permissions?.forbidden?.length) {
          console.log(`Forbidden: ${decl.permissions.forbidden.join(', ')}`);
        }
      } catch (err) {
        console.error(`Failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });
}
