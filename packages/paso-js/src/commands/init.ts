import { Command } from 'commander';
import { resolve, join, dirname } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { generateFromOpenApi } from '../openapi';
import { parse as parseYaml } from 'yaml';
import { green, cyan, dim } from '../utils/color';
import { ensureGitignore } from '../utils/env';

const MAX_SPEC_SIZE = 50 * 1024 * 1024; // 50MB

const ENV_EXAMPLE = `# paso auth token. Never commit .env to version control.
USEPASO_AUTH_TOKEN=your-token-here
`;

function scaffoldEnv(outDir: string): void {
  const examplePath = join(outDir, '.env.example');
  if (!existsSync(examplePath)) {
    writeFileSync(examplePath, ENV_EXAMPLE, 'utf-8');
  }
  ensureGitignore(outDir);
}

const FALLBACK_TEMPLATE = `# yaml-language-server: $schema=https://raw.githubusercontent.com/5h1vmani/usepaso/main/spec/usepaso.schema.json\nversion: "1.0"\n\nservice:\n  name: __SERVICE_NAME__\n  description: TODO: describe what your service does\n  base_url: https://api.example.com\n  auth:\n    type: bearer\n\ncapabilities:\n  - name: example_action\n    description: TODO: describe what this action does\n    method: GET\n    path: /example\n    permission: read\n    inputs:\n      id:\n        type: string\n        required: true\n        description: TODO: describe this parameter\n        in: query\n    output:\n      result:\n        type: string\n        description: TODO: describe the output\n\npermissions:\n  read:\n    - example_action\n`;

const EXAMPLE_TEMPLATE = `# A working example using JSONPlaceholder (free, public, no auth).
# Run "usepaso validate" and "usepaso serve" right now. No edits needed.
# When you are ready, replace the values below with your own API.

version: "1.0"

service:
  name: JSONPlaceholder
  description: Free fake REST API for testing and prototyping
  base_url: https://jsonplaceholder.typicode.com
  auth:
    type: none  # Explicit. Change to "bearer" when you connect a real API.

capabilities:
  # A read capability with a query parameter filter
  - name: list_posts
    description: List all posts, optionally filtered by author
    method: GET
    path: /posts
    permission: read
    inputs:
      userId:
        type: integer
        description: Filter posts by this author ID
        in: query

  # A read capability with a path parameter
  - name: get_post
    description: Get a single post by ID
    method: GET
    path: /posts/{id}
    permission: read
    inputs:
      id:
        type: integer
        required: true
        description: The post ID
        in: path

  # A write capability with a request body
  - name: create_post
    description: Create a new post
    method: POST
    path: /posts
    permission: write
    inputs:
      title:
        type: string
        required: true
        description: Post title
        in: body
      body:
        type: string
        required: true
        description: Post content
        in: body
      userId:
        type: integer
        required: true
        description: Author ID
        in: body

  # A destructive action. consent_required means the agent must ask the user first.
  - name: delete_post
    description: Delete a post permanently
    method: DELETE
    path: /posts/{id}
    permission: write
    consent_required: true
    inputs:
      id:
        type: integer
        required: true
        description: The post ID to delete
        in: path

# Permission groups control which capabilities agents can access.
# "read" actions are safe. "write" actions modify data.
permissions:
  read:
    - list_posts
    - get_post
  write:
    - create_post
    - delete_post
`;

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
    .option('--blank', 'Generate a blank template (instead of the default working example)')
    .option('--example', 'Generate a working example using JSONPlaceholder (same as default)')
    .option('--from-openapi <path>', 'Generate from an OpenAPI 3.x spec (JSON, YAML, or URL)')
    .option(
      '--max-capabilities <n>',
      'Max capabilities to generate from OpenAPI (default: 20)',
      '20',
    )
    .action(async (opts) => {
      const outPath = resolve('usepaso.yaml');
      if (existsSync(outPath)) {
        console.error('usepaso.yaml already exists in this directory.');
        process.exit(1);
      }

      if (opts.blank && opts.fromOpenapi) {
        console.error('Cannot use --blank and --from-openapi together.');
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

            // Fast reject if Content-Length exceeds limit
            const contentLength = res.headers.get('content-length');
            if (contentLength && parseInt(contentLength, 10) > MAX_SPEC_SIZE) {
              const sizeMb = Math.round(parseInt(contentLength, 10) / 1024 / 1024);
              console.error(
                `OpenAPI spec exceeds 50MB limit (${sizeMb}MB). Check the URL or use a local file.`,
              );
              process.exit(1);
            }

            // Stream with size guard (servers can omit or lie about Content-Length)
            const reader = res.body?.getReader();
            if (!reader) {
              console.error('Failed to read response body.');
              process.exit(1);
            }
            const chunks: Uint8Array[] = [];
            let totalBytes = 0;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              totalBytes += value.byteLength;
              if (totalBytes > MAX_SPEC_SIZE) {
                reader.cancel();
                console.error(
                  `OpenAPI spec exceeds 50MB limit. Check the URL or use a local file.`,
                );
                process.exit(1);
              }
              chunks.push(value);
            }
            specContent = Buffer.concat(chunks).toString('utf-8');
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

          const maxCaps = parseInt(opts.maxCapabilities, 10);
          if (isNaN(maxCaps) || maxCaps < 1) {
            console.error('--max-capabilities must be a positive integer.');
            process.exit(1);
          }
          const result = generateFromOpenApi(spec, maxCaps);
          writeFileSync(outPath, result.yaml, 'utf-8');

          scaffoldEnv(dirname(outPath));
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
            dim("  1. Review the generated capabilities. Remove any you don't want exposed"),
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

      if (opts.blank || opts.name) {
        const name = opts.name || 'MyService';
        const template = loadTemplate().replaceAll('__SERVICE_NAME__', name);
        writeFileSync(outPath, template, 'utf-8');
        scaffoldEnv(dirname(outPath));
        console.log(green(`Created usepaso.yaml for "${name}".`));
        console.log('');
        console.log(dim('Next steps:'));
        console.log(dim('  1. Declare your capabilities in usepaso.yaml'));
        console.log(dim('  2. Copy .env.example to .env and add your API token'));
        console.log(dim('  3. usepaso validate         Check for issues'));
        console.log(dim('  4. usepaso test --dry-run    Preview what agents will see'));
        console.log(dim('  5. usepaso serve             Start the MCP server'));
        return;
      }

      // Default: working example (JSONPlaceholder)
      writeFileSync(outPath, EXAMPLE_TEMPLATE, 'utf-8');
      console.log(green('Created usepaso.yaml with a working JSONPlaceholder example.'));
      console.log(dim('No auth needed. No edits needed. Try it now:'));
      console.log('');
      console.log(dim('  usepaso validate'));
      console.log(dim('  usepaso test list_posts --dry-run'));
      console.log(dim('  usepaso test get_post --param id=1 --dry-run'));
      console.log(dim('  usepaso serve'));
      console.log(dim('  usepaso connect cursor         Wire up your IDE'));
      console.log('');
      console.log(dim('When you are ready, replace the JSONPlaceholder values with your own API.'));
    });
}
