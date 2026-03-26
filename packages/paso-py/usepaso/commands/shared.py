import re
import sys
from pathlib import Path

import click

from usepaso.parser import parse_file
from usepaso.validator import validate
from usepaso.utils.color import red, yellow, dim


def load_and_validate(file_path):
    """Load and validate a usepaso.yaml, exit on error."""
    try:
        decl = parse_file(file_path)
    except FileNotFoundError:
        click.echo(red(f"Error: file '{file_path}' not found") + dim(" Run usepaso init to create one."), err=True)
        sys.exit(1)
    except Exception as e:
        click.echo(red(f"Error parsing {file_path}: {e}"), err=True)
        sys.exit(1)

    results = validate(decl)
    errors = [e for e in results if e.level != 'warning']
    warnings = [e for e in results if e.level == 'warning']

    if errors:
        click.echo(red(f"Validation failed with {len(errors)} error(s):"), err=True)
        for error in errors:
            click.echo(f"  {red(error.path)}: {error.message}", err=True)
        sys.exit(1)

    for w in warnings:
        click.echo(f"  {yellow('warning')}: {w.path}: {w.message}", err=True)

    return decl


def mcp_config_snippet(file_path, service_name):
    abs_path = str(Path(file_path).resolve())
    slug = re.sub(r'[^a-z0-9]+', '-', service_name.lower()).strip('-')
    return f"""
Add this to your MCP client config:

Claude Desktop (claude_desktop_config.json):
{{
  "mcpServers": {{
    "{slug}": {{
      "command": "usepaso",
      "args": ["serve", "-f", "{abs_path}"],
      "env": {{ "USEPASO_AUTH_TOKEN": "your-token" }}
    }}
  }}
}}

Cursor (.cursor/mcp.json):
{{
  "{slug}": {{
    "command": "usepaso",
    "args": ["serve", "-f", "{abs_path}"],
    "env": {{ "USEPASO_AUTH_TOKEN": "your-token" }}
  }}
}}"""
