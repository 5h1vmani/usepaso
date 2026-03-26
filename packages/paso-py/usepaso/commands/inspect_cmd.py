import json
import sys

import click

from usepaso.parser import parse_file
from usepaso.validator import validate
from usepaso.commands.shared import load_and_validate
from usepaso.utils.color import cyan, dim


def register(cli_group):
    @cli_group.command('inspect')
    @click.option('--file', '-f', default='usepaso.yaml', help='Path to usepaso.yaml file')
    @click.option('--json', 'as_json', is_flag=True, help='Output result as JSON')
    def inspect_cmd(file, as_json):
        """Show what MCP tools would be generated (dry run)."""

        if as_json:
            try:
                decl = parse_file(file)
            except FileNotFoundError:
                click.echo(json.dumps({"error": f"File not found: {file}"}))
                sys.exit(1)
            except Exception as e:
                click.echo(json.dumps({"error": str(e)}))
                sys.exit(1)

            results = validate(decl)
            errors = [e for e in results if e.level != 'warning']
            if errors:
                click.echo(json.dumps({
                    "error": "Validation failed",
                    "errors": [{"path": e.path, "message": e.message} for e in errors],
                }))
                sys.exit(1)

            forbidden = set(decl.permissions.forbidden) if decl.permissions and decl.permissions.forbidden else set()
            tools = [c for c in decl.capabilities if c.name not in forbidden]

            click.echo(json.dumps({
                "service": decl.service.name,
                "auth": decl.service.auth.type if decl.service.auth else "none",
                "tools": [
                    {
                        "name": t.name,
                        "permission": t.permission,
                        "method": t.method,
                        "path": t.path,
                        "description": t.description,
                        "consent_required": t.consent_required or False,
                        "params": [
                            f"{k}{'*' if v.required else ''}: {v.type}"
                            for k, v in (t.inputs or {}).items()
                        ],
                    }
                    for t in tools
                ],
                "forbidden": list(decl.permissions.forbidden) if decl.permissions and decl.permissions.forbidden else [],
            }))
            return

        decl = load_and_validate(file)

        forbidden = set(decl.permissions.forbidden) if decl.permissions and decl.permissions.forbidden else set()
        tools = [c for c in decl.capabilities if c.name not in forbidden]

        click.echo(f"Service: {cyan(decl.service.name)}")
        click.echo(f"Tools:   {len(tools)}")
        click.echo(f"Auth:    {decl.service.auth.type if decl.service.auth else 'none'}")
        click.echo("")

        for i, tool in enumerate(tools):
            is_last = i == len(tools) - 1
            connector = '┌' if i == 0 else ('└' if is_last else '├')
            cont = ' ' if is_last else '│'
            badge = " [consent required]" if tool.consent_required else ""
            click.echo(f"  {dim(connector)} {cyan(tool.name)} {dim(f'({tool.permission})')}{badge}")
            click.echo(f"  {dim(cont)} {dim(f'{tool.method} {tool.path}')}")
            click.echo(f"  {dim(cont)} {tool.description}")
            if tool.inputs:
                params = ", ".join(
                    f"{k}{'*' if v.required else ''}: {v.type}"
                    for k, v in tool.inputs.items()
                )
                click.echo(f"  {dim(cont)} params: {params}")
            if not is_last:
                click.echo(f"  {dim('│')}")
        click.echo("")

        if decl.permissions and decl.permissions.forbidden:
            click.echo(f"Forbidden: {', '.join(decl.permissions.forbidden)}")
