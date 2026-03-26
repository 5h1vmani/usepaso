import { Command } from 'commander';
import { resolve, join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { generateFromOpenApi } from '../openapi';
import { parse as parseYaml } from 'yaml';
import { green, cyan, dim } from '../utils/color';

const FALLBACK_TEMPLATE = `# yaml-language-server: $schema=https://raw.githubusercontent.com/5h1vmani/usepaso/main/spec/usepaso.schema.json\nversion: "1.0"\n\nservice:\n  name: __SERVICE_NAME__\n  description: TODO — describe what your service does\n  base_url: https://api.example.com\n  auth:\n    type: bearer\n\ncapabilities:\n  - name: example_action\n    description: TODO — describe what this action does\n    method: GET\n    path: /example\n    permission: read\n    inputs:\n      id:\n        type: string\n        required: true\n        description: TODO — describe this parameter\n        in: query\n    output:\n      result:\n        type: string\n        description: TODO — describe the output\n\npermissions:\n  read:\n    - example_action\n`;

function loadTemplate(): string {
  const candidates = [
    join(__dirname, '..', '..', '..', '..', 'examples', 'template', 'usepaso.yaml'),
    join(__dirname, '..', '..', '..', 'examples', 'template', 'usepaso.yaml'),
  ];
  for (const tp of candidates) {
    if (existsSync(tp)) {
      return readFileSync(tp, 'utf-8');
    }
  }
  return FALLBACK_TEMPLATE;
}

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Create a usepaso.yaml template in the current directory')
    .option('-n, --name <name>', 'Service name')
    .option('--from-openapi <path>', 'Generate from an OpenAPI 3.x spec (JSON, YAML, or URL)')
    .action(async (opts) => {
      const outPath = resolve('usepaso.yaml');
      if (existsSync(outPath)) {
        console.error('usepaso.yaml already exists in this directory.');
        process.exit(1);
      }

      if (opts.fromOpenapi) {
        const source = opts.fromOpenapi as string;

        try {
          let specContent: string;

          if (source.startsWith('http://') || source.startsWith('https://')) {
            const res = await fetch(source);
            if (!res.ok) {
              console.error(`Failed to fetch OpenAPI spec: ${res.status} ${res.statusText}`);
              process.exit(1);
            }
            specContent = await res.text();
          } else {
            const specPath = resolve(source);
            if (!existsSync(specPath)) {
              console.error(`OpenAPI spec not found: ${specPath}`);
              process.exit(1);
            }
            specContent = readFileSync(specPath, 'utf-8');
          }

          let spec: object;
          try {
            spec = JSON.parse(specContent);
          } catch {
            spec = parseYaml(specContent);
          }

          const result = generateFromOpenApi(spec);
          writeFileSync(outPath, result.yaml, 'utf-8');

          console.log(green(`Generated usepaso.yaml from ${source}`));
          console.log(`  Service:      ${cyan(result.serviceName)}`);
          console.log(
            `  Capabilities: ${result.generatedCount} (${result.readCount} read, ${result.writeCount} write, ${result.adminCount} admin)`,
          );
          console.log(`  Auth:         ${result.authType}`);
          if (result.totalOperations > result.generatedCount) {
            console.log(
              `  Note: ${result.totalOperations} operations found, capped at ${result.generatedCount}. Edit usepaso.yaml to add more.`,
            );
          }
          console.log('');
          console.log(dim('Next steps:'));
          console.log(
            dim("  1. Review the generated capabilities — remove any you don't want exposed"),
          );
          console.log(dim('  2. usepaso validate         Check for issues'));
          console.log(dim('  3. usepaso test --dry-run    Preview what agents will see'));
          console.log(dim('  4. usepaso serve             Start the MCP server'));
        } catch (err) {
          console.error(
            `Failed to convert OpenAPI spec: ${err instanceof Error ? err.message : err}`,
          );
          process.exit(1);
        }
        return;
      }

      const name = opts.name || 'MyService';
      const template = loadTemplate().replaceAll('__SERVICE_NAME__', name);
      writeFileSync(outPath, template, 'utf-8');
      console.log(green(`Created usepaso.yaml for "${name}".`));
      console.log('');
      console.log(dim('Next steps:'));
      console.log(dim('  1. Declare your capabilities in usepaso.yaml'));
      console.log(dim('  2. usepaso validate         Check for issues'));
      console.log(dim('  3. usepaso test --dry-run    Preview what agents will see'));
      console.log(dim('  4. usepaso serve             Start the MCP server'));
    });
}
