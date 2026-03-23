import { Command } from 'commander';
import { resolve } from 'path';
import { watchFile } from 'fs';
import { loadAndValidate, mcpConfigSnippet } from './shared';
import { serveMcp } from '../generators/mcp';

export function registerServe(program: Command): void {
  program
    .command('serve')
    .description('Start an MCP server from a usepaso.yaml declaration')
    .option('-f, --file <path>', 'Path to usepaso.yaml', 'usepaso.yaml')
    .option('-v, --verbose', 'Log all requests to stderr')
    .option('-w, --watch', 'Notify when usepaso.yaml changes (requires manual restart)')
    .action(async (opts) => {
      const filePath = resolve(opts.file);

      try {
        const decl = loadAndValidate(filePath);

        // Auth warning
        if (
          decl.service.auth &&
          decl.service.auth.type !== 'none' &&
          !process.env.USEPASO_AUTH_TOKEN
        ) {
          console.error(
            `Warning: auth type "${decl.service.auth.type}" is configured but USEPASO_AUTH_TOKEN is not set. API requests will likely fail with 401.`,
          );
        }

        console.error(
          `usepaso serving "${decl.service.name}" (${decl.capabilities.length} capabilities)`,
        );
        console.error('Transport: stdio — waiting for MCP client...');

        // Show MCP config snippet
        console.error(mcpConfigSnippet(filePath, decl.service.name));
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
                console.error(
                  `[${now}] ${capName} → ${result.request.method} ${result.request.url} ← ${result.status} (${result.durationMs}ms)`,
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

        await serveMcp(decl, onLog);
      } catch (err) {
        console.error(`Failed to start: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });
}
