import { Command } from 'commander';
import { resolve } from 'path';
import { watchFile } from 'fs';
import { loadAndValidate, mcpConfigSnippet } from './shared';
import { serveMcp } from '../generators/mcp';
import { green, cyan, yellow, dim } from '../utils/color';
import { redactUrl } from '../utils/redact';
import { loadEnvFile } from '../utils/env';

export function registerServe(program: Command): void {
  program
    .command('serve')
    .description('Start an MCP server from a usepaso.yaml declaration')
    .option('-f, --file <path>', 'Path to usepaso.yaml', 'usepaso.yaml')
    .option('--env <path>', 'Path to .env file (default: .env next to usepaso.yaml)')
    .option('-v, --verbose', 'Log all requests to stderr')
    .option('-w, --watch', 'Notify when usepaso.yaml changes (requires manual restart)')
    .option('--strict', 'Enforce consent gates server-side (for headless/untrusted agents)')
    .action(async (opts) => {
      const filePath = resolve(opts.file);

      try {
        const decl = loadAndValidate(filePath);

        // Load .env file if present (does not override existing env vars)
        const loaded = loadEnvFile(filePath, opts.env);
        if (loaded) {
          console.error(dim(`Loaded environment from ${opts.env || '.env'}`));
        }

        // Auth notices (logged once at startup, not per-request)
        const authToken = process.env.USEPASO_AUTH_TOKEN;
        if (authToken !== undefined && authToken === '') {
          console.error(
            yellow(`Warning: USEPASO_AUTH_TOKEN is set but empty. API requests will likely fail.`),
          );
        }
        if (decl.service.auth) {
          if (decl.service.auth.type === 'none' && authToken) {
            console.error(yellow(`Note: auth.type is "none", ignoring USEPASO_AUTH_TOKEN`));
          } else if (decl.service.auth.type !== 'none' && !authToken) {
            console.error(
              yellow(
                `Warning: auth type "${decl.service.auth.type}" is configured but USEPASO_AUTH_TOKEN is not set. API requests will likely fail with 401.`,
              ),
            );
          }
        }

        // Security: warn if base_url uses plain HTTP
        if (decl.service.base_url.startsWith('http://')) {
          console.error(
            yellow(`Warning: base_url uses http://. Auth tokens will be sent in plain text.`),
          );
        }

        if (opts.strict) {
          console.error(yellow('Strict mode: consent-gated tools require two-phase confirmation.'));
        }

        console.error(
          `${green('usepaso serving')} "${cyan(decl.service.name)}" (${decl.capabilities.length} capabilities). Agents welcome.`,
        );
        console.error('Transport: stdio. Waiting for an MCP client...');

        // Show MCP config snippet
        console.error(mcpConfigSnippet(decl.service.name));
        console.error('');

        // Verbose logging callback
        const onLog = opts.verbose
          ? (
              capName: string,
              result: {
                request: { method: string; url: string };
                status?: number;
                durationMs: number;
                error?: string;
              },
            ) => {
              const now = new Date().toISOString().slice(11, 19);
              if (result.error) {
                console.error(`[${now}] ${capName} → ERROR: ${result.error}`);
              } else {
                const safeUrl = redactUrl(result.request.url);
                console.error(
                  `[${now}] ${capName} → ${result.request.method} ${safeUrl} ← ${result.status} (${result.durationMs}ms)`,
                );
              }
            }
          : undefined;

        // Watch mode
        if (opts.watch) {
          console.error(`Watching ${filePath} for changes...`);
          watchFile(filePath, { interval: 1000 }, () => {
            console.error(`\nFile changed. Restart the server to pick up changes.`);
          });
        }

        await serveMcp(decl, { onLog, strict: opts.strict });
      } catch (err) {
        console.error(`Failed to start: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });
}
