import { Command } from 'commander';
import { resolve } from 'path';
import { loadAndValidate } from './shared';

export function registerInspect(program: Command): void {
  program
    .command('inspect')
    .description('Show what MCP tools would be generated (dry run)')
    .option('-f, --file <path>', 'Path to usepaso.yaml', 'usepaso.yaml')
    .action((opts) => {
      try {
        const decl = loadAndValidate(resolve(opts.file));

        const forbidden = new Set(decl.permissions?.forbidden || []);
        const tools = decl.capabilities.filter((c) => !forbidden.has(c.name));

        console.log(`Service: ${decl.service.name}`);
        console.log(`Tools:   ${tools.length}`);
        console.log(`Auth:    ${decl.service.auth?.type || 'none'}`);
        console.log('');

        for (const tool of tools) {
          const badge = tool.consent_required ? ' [consent required]' : '';
          console.log(`  ${tool.name} (${tool.permission})${badge}`);
          console.log(`    ${tool.method} ${tool.path}`);
          console.log(`    ${tool.description}`);
          if (tool.inputs) {
            const params = Object.entries(tool.inputs)
              .map(([k, v]) => `${k}${v.required ? '*' : ''}: ${v.type}`)
              .join(', ');
            console.log(`    params: ${params}`);
          }
          console.log('');
        }

        if (decl.permissions?.forbidden?.length) {
          console.log(`Forbidden: ${decl.permissions.forbidden.join(', ')}`);
        }
      } catch (err) {
        console.error(`Failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });
}
