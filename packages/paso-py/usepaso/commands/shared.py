import re
import sys

import click

from usepaso.parser import parse_file
from usepaso.validator import validate
from usepaso.utils.color import red, yellow, dim


def load_and_validate(file_path):
    """Load and validate a usepaso.yaml, exit on error."""
    try:
        decl = parse_file(file_path)
    except FileNotFoundError:
        click.echo(red(f"File not found: {file_path}") + dim(" Run usepaso init to create one."), err=True)
        sys.exit(1)
    except Exception as e:
        click.echo(red(f"Failed to parse {file_path}: {e}"), err=True)
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


def slugify(name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-') or 'usepaso-service'


def mcp_config_snippet(service_name):
    slug = slugify(service_name)
    return f"""
Connect to an MCP client:

  usepaso connect claude-desktop
  usepaso connect cursor
  usepaso connect vscode
  usepaso connect windsurf

Or add "{slug}" manually to your client config. See: usepaso connect --help"""
