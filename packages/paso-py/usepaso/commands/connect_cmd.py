import json
import os
import sys
from pathlib import Path

import click

from usepaso.commands.shared import load_and_validate, slugify
from usepaso.utils.color import green, cyan, red, yellow, dim
from usepaso.utils.env import load_env_file


CLIENTS = ('claude-desktop', 'cursor', 'vscode', 'windsurf')


def _resolve_client_config(client: str) -> dict:
    home = Path.home()
    platform = sys.platform

    if client == 'claude-desktop':
        if platform == 'win32':
            config_dir = Path(os.environ.get('APPDATA', home / 'AppData' / 'Roaming')) / 'Claude'
        elif platform == 'darwin':
            config_dir = home / 'Library' / 'Application Support' / 'Claude'
        else:
            config_dir = home / '.config' / 'Claude'
        return {
            'config_path': str(config_dir / 'claude_desktop_config.json'),
            'wrap_in_mcp_servers': True,
            'use_absolute_path': True,
            'display_name': 'Claude Desktop',
            'restart_hint': 'Restart Claude Desktop to connect.',
        }
    elif client == 'cursor':
        return {
            'config_path': str(Path('.cursor', 'mcp.json').resolve()),
            'wrap_in_mcp_servers': True,
            'use_absolute_path': False,
            'display_name': 'Cursor',
            'restart_hint': 'Restart Cursor to connect.',
        }
    elif client == 'vscode':
        return {
            'config_path': str(Path('.vscode', 'mcp.json').resolve()),
            'wrap_in_mcp_servers': False,
            'use_absolute_path': False,
            'display_name': 'VS Code',
            'restart_hint': 'Reload VS Code to connect.',
        }
    elif client == 'windsurf':
        if platform == 'win32':
            config_dir = Path(os.environ.get('APPDATA', home / 'AppData' / 'Roaming')) / 'Codeium' / 'Windsurf'
        else:
            config_dir = home / '.codeium' / 'windsurf'
        return {
            'config_path': str(config_dir / 'mcp_config.json'),
            'wrap_in_mcp_servers': True,
            'use_absolute_path': False,
            'display_name': 'Windsurf',
            'restart_hint': 'Restart Windsurf to connect.',
        }
    else:
        raise ValueError(f'Unknown client: "{client}"')


def _build_entry(yaml_path: str, has_token: bool, use_absolute_path: bool) -> dict:
    # IDE clients (Cursor, VS Code, Windsurf) run from the project root.
    # Use bare "usepaso serve" so the config is portable across machines.
    # Claude Desktop doesn't set CWD, so it needs the absolute path.
    if use_absolute_path:
        args = ['serve', '-f', str(Path(yaml_path).resolve())]
    else:
        args = ['serve']
    entry: dict = {'command': 'usepaso', 'args': args}
    if not has_token:
        entry['env'] = {'USEPASO_AUTH_TOKEN': 'your-token'}
    return entry


def _read_json_file(path: str) -> dict:
    p = Path(path)
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding='utf-8'))
    except json.JSONDecodeError as e:
        raise ValueError(
            f'Failed to parse {path}: {e}\nFix the JSON manually or delete the file and try again.'
        ) from e


def _get_servers(config: dict, client_config: dict) -> dict:
    if client_config['wrap_in_mcp_servers']:
        if 'mcpServers' not in config or not isinstance(config.get('mcpServers'), dict):
            config['mcpServers'] = {}
        return config['mcpServers']
    if 'servers' not in config or not isinstance(config.get('servers'), dict):
        config['servers'] = {}
    return config['servers']


def _write_config(config_path: str, config: dict) -> None:
    p = Path(config_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(config, indent=2) + '\n', encoding='utf-8')


def register(cli_group):
    @cli_group.command()
    @click.argument('client', type=click.Choice(CLIENTS))
    @click.option('-f', '--file', default='usepaso.yaml', help='Path to usepaso.yaml')
    @click.option('--env', 'env_file', default=None, help='Path to .env file (default: .env next to usepaso.yaml)')
    @click.option('--force', is_flag=True, help='Overwrite existing entry for this service')
    def connect(client, file, env_file, force):
        """Add this server to an MCP client config."""
        try:
            file_path = str(Path(file).resolve())
            decl = load_and_validate(file_path)

            # Load .env so we can detect whether a token is available
            load_env_file(file_path, env_file)
            has_token = bool(os.environ.get('USEPASO_AUTH_TOKEN'))

            slug = slugify(decl.service.name)
            client_config = _resolve_client_config(client)

            existing = _read_json_file(client_config['config_path'])
            entry = _build_entry(file_path, has_token, client_config['use_absolute_path'])
            servers = _get_servers(existing, client_config)

            if slug in servers and not force:
                raise ValueError(
                    f'Entry "{slug}" already exists in {client_config["display_name"]} config. Use --force to overwrite.'
                )

            is_update = slug in servers
            servers[slug] = entry

            _write_config(client_config['config_path'], existing)

            verb = 'Updated' if is_update else 'Added'
            click.echo(f'{green(verb)} "{cyan(decl.service.name)}" in {client_config["display_name"]} config.')
            click.echo(dim(f'  Config: {client_config["config_path"]}'))
            if not has_token:
                click.echo('')
                click.echo(yellow('Note: No auth token found. Set USEPASO_AUTH_TOKEN in .env or your environment.'))
            click.echo('')
            click.echo(client_config['restart_hint'])
        except SystemExit:
            raise
        except Exception as e:
            click.echo(red(str(e)), err=True)
            sys.exit(1)

    @cli_group.command()
    @click.argument('client', type=click.Choice(CLIENTS))
    @click.option('-f', '--file', default='usepaso.yaml', help='Path to usepaso.yaml')
    def disconnect(client, file):
        """Remove this server from an MCP client config."""
        try:
            file_path = str(Path(file).resolve())
            decl = load_and_validate(file_path)
            slug = slugify(decl.service.name)
            client_config = _resolve_client_config(client)

            if not Path(client_config['config_path']).exists():
                click.echo(dim(f'No config file found at {client_config["config_path"]}. Nothing to remove.'))
                return

            existing = _read_json_file(client_config['config_path'])
            servers = _get_servers(existing, client_config)

            if slug not in servers:
                click.echo(dim(f'Entry "{slug}" not found in {client_config["display_name"]} config. Nothing to remove.'))
                return

            del servers[slug]
            _write_config(client_config['config_path'], existing)

            click.echo(f'{green("Removed")} "{cyan(decl.service.name)}" from {client_config["display_name"]} config.')
            click.echo(dim(f'  Config: {client_config["config_path"]}'))
            click.echo('')
            click.echo(client_config['restart_hint'])
        except SystemExit:
            raise
        except Exception as e:
            click.echo(red(str(e)), err=True)
            sys.exit(1)
