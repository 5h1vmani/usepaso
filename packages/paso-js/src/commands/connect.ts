import { Command } from 'commander';
import { resolve, dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { loadAndValidate, slugify } from './shared';
import { green, cyan, red, yellow, dim } from '../utils/color';
import { loadEnvFile } from '../utils/env';

interface ClientConfig {
  configPath: string;
  wrapInMcpServers: boolean;
  useAbsolutePath: boolean;
  displayName: string;
  restartHint: string;
}

const CLIENTS = ['claude-desktop', 'cursor', 'vscode', 'windsurf'] as const;
type Client = (typeof CLIENTS)[number];

function resolveClientConfig(client: Client): ClientConfig {
  const home = homedir();
  const platform = process.platform;

  switch (client) {
    case 'claude-desktop': {
      let configDir: string;
      if (platform === 'win32') {
        configDir = join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Claude');
      } else if (platform === 'darwin') {
        configDir = join(home, 'Library', 'Application Support', 'Claude');
      } else {
        configDir = join(home, '.config', 'Claude');
      }
      return {
        configPath: join(configDir, 'claude_desktop_config.json'),
        wrapInMcpServers: true,
        useAbsolutePath: true,
        displayName: 'Claude Desktop',
        restartHint: 'Restart Claude Desktop to connect.',
      };
    }
    case 'cursor':
      return {
        configPath: resolve('.cursor', 'mcp.json'),
        wrapInMcpServers: true,
        useAbsolutePath: false,
        displayName: 'Cursor',
        restartHint: 'Restart Cursor to connect.',
      };
    case 'vscode':
      return {
        configPath: resolve('.vscode', 'mcp.json'),
        wrapInMcpServers: false,
        useAbsolutePath: false,
        displayName: 'VS Code',
        restartHint: 'Reload VS Code to connect.',
      };
    case 'windsurf': {
      let configDir: string;
      if (platform === 'win32') {
        configDir = join(
          process.env.APPDATA || join(home, 'AppData', 'Roaming'),
          'Codeium',
          'Windsurf',
        );
      } else {
        configDir = join(home, '.codeium', 'windsurf');
      }
      return {
        configPath: join(configDir, 'mcp_config.json'),
        wrapInMcpServers: true,
        useAbsolutePath: false,
        displayName: 'Windsurf',
        restartHint: 'Restart Windsurf to connect.',
      };
    }
    default:
      throw new Error(`Unknown client: "${client}"`);
  }
}

function buildEntry(
  yamlPath: string,
  hasToken: boolean,
  useAbsolutePath: boolean,
): Record<string, unknown> {
  // IDE clients (Cursor, VS Code, Windsurf) run from the project root.
  // Use bare "usepaso serve" so the config is portable across machines.
  // Claude Desktop doesn't set CWD, so it needs the absolute path.
  const args = useAbsolutePath
    ? ['usepaso', 'serve', '-f', resolve(yamlPath)]
    : ['usepaso', 'serve'];
  const entry: Record<string, unknown> = { command: 'npx', args };
  if (!hasToken) {
    entry.env = { USEPASO_AUTH_TOKEN: 'your-token' };
  }
  return entry;
}

function readJsonFile(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse ${path}: ${err instanceof Error ? err.message : err}\nFix the JSON manually or delete the file and try again.`,
      { cause: err },
    );
  }
}

function getServers(
  config: Record<string, unknown>,
  clientConfig: ClientConfig,
): Record<string, unknown> {
  if (clientConfig.wrapInMcpServers) {
    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      config.mcpServers = {};
    }
    return config.mcpServers as Record<string, unknown>;
  }
  if (!config.servers || typeof config.servers !== 'object') {
    config.servers = {};
  }
  return config.servers as Record<string, unknown>;
}

function writeConfig(configPath: string, config: Record<string, unknown>): void {
  const configDir = dirname(configPath);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

function validateClient(client: string): Client {
  if (!CLIENTS.includes(client as Client)) {
    throw new Error(`Unknown client: "${client}". Supported clients: ${CLIENTS.join(', ')}`);
  }
  return client as Client;
}

export function registerConnect(program: Command): void {
  program
    .command('connect')
    .description('Add this server to an MCP client config')
    .argument('<client>', `Client to configure (${CLIENTS.join(', ')})`)
    .option('-f, --file <path>', 'Path to usepaso.yaml', 'usepaso.yaml')
    .option('--env <path>', 'Path to .env file (default: .env next to usepaso.yaml)')
    .option('--force', 'Overwrite existing entry for this service')
    .action((client: string, opts) => {
      try {
        const validClient = validateClient(client);
        const filePath = resolve(opts.file);
        const decl = loadAndValidate(filePath);

        // Load .env so we can detect whether a token is available
        loadEnvFile(filePath, opts.env);
        const hasToken = !!process.env.USEPASO_AUTH_TOKEN;

        const slug = slugify(decl.service.name);
        const clientConfig = resolveClientConfig(validClient);

        const existing = readJsonFile(clientConfig.configPath);
        const entry = buildEntry(filePath, hasToken, clientConfig.useAbsolutePath);
        const servers = getServers(existing, clientConfig);

        if (servers[slug] && !opts.force) {
          throw new Error(
            `Entry "${slug}" already exists in ${clientConfig.displayName} config. Use --force to overwrite.`,
          );
        }

        const isUpdate = !!servers[slug];
        servers[slug] = entry;

        writeConfig(clientConfig.configPath, existing);

        const verb = isUpdate ? 'Updated' : 'Added';
        console.log(
          `${green(verb)} "${cyan(decl.service.name)}" in ${clientConfig.displayName} config.`,
        );
        console.log(dim(`  Config: ${clientConfig.configPath}`));
        if (!hasToken) {
          console.log('');
          console.log(
            yellow(
              'Note: No auth token found. Set USEPASO_AUTH_TOKEN in .env or your environment.',
            ),
          );
        }
        console.log('');
        console.log(clientConfig.restartHint);
      } catch (err) {
        console.error(red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    });
}

export function registerDisconnect(program: Command): void {
  program
    .command('disconnect')
    .description('Remove this server from an MCP client config')
    .argument('<client>', `Client to update (${CLIENTS.join(', ')})`)
    .option('-f, --file <path>', 'Path to usepaso.yaml', 'usepaso.yaml')
    .action((client: string, opts) => {
      try {
        const validClient = validateClient(client);
        const filePath = resolve(opts.file);
        const decl = loadAndValidate(filePath);
        const slug = slugify(decl.service.name);
        const clientConfig = resolveClientConfig(validClient);

        if (!existsSync(clientConfig.configPath)) {
          console.log(
            dim(`No config file found at ${clientConfig.configPath}. Nothing to remove.`),
          );
          return;
        }

        const existing = readJsonFile(clientConfig.configPath);
        const servers = getServers(existing, clientConfig);

        if (!servers[slug]) {
          console.log(
            dim(
              `Entry "${slug}" not found in ${clientConfig.displayName} config. Nothing to remove.`,
            ),
          );
          return;
        }

        delete servers[slug];
        writeConfig(clientConfig.configPath, existing);

        console.log(
          `${green('Removed')} "${cyan(decl.service.name)}" from ${clientConfig.displayName} config.`,
        );
        console.log(dim(`  Config: ${clientConfig.configPath}`));
        console.log('');
        console.log(clientConfig.restartHint);
      } catch (err) {
        console.error(red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    });
}
