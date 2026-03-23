import sys
import click
from pathlib import Path
from paso.parser import parse_file
from paso.validator import validate
from paso.generators.mcp import serve_mcp


PASO_YAML_TEMPLATE = """version: "1.0"

service:
  name: {name}
  description: TODO — describe what your service does
  base_url: https://api.example.com
  auth:
    type: bearer

capabilities:
  - name: example_action
    description: TODO — describe what this action does
    method: GET
    path: /example
    permission: read
    inputs:
      id:
        type: string
        required: true
        description: TODO — describe this parameter
        in: query
    output:
      result:
        type: string
        description: TODO — describe the output

permissions:
  read:
    - example_action
"""


@click.group()
def main():
    """usepaso — Make your API agent-ready in minutes."""
    pass


@main.command()
@click.option('--name', default='MyService', help='Service name for paso.yaml')
def init(name):
    """Initialize a new paso.yaml file in the current directory."""
    paso_file = Path('paso.yaml')

    if paso_file.exists():
        click.echo("Error: paso.yaml already exists in this directory", err=True)
        sys.exit(1)

    content = PASO_YAML_TEMPLATE.format(name=name)
    paso_file.write_text(content, encoding='utf-8')
    click.echo(f"Created paso.yaml with service name '{name}'")


@main.command()
@click.option('--file', '-f', default='paso.yaml', help='Path to paso.yaml file')
def validate_cmd(file):
    """Validate a paso.yaml file."""
    try:
        decl = parse_file(file)
    except FileNotFoundError:
        click.echo(f"Error: file '{file}' not found", err=True)
        sys.exit(1)
    except Exception as e:
        click.echo(f"Error parsing {file}: {str(e)}", err=True)
        sys.exit(1)

    errors = validate(decl)

    if errors:
        click.echo(f"Validation failed with {len(errors)} error(s):", err=True)
        for error in errors:
            click.echo(f"  {error.path}: {error.message}", err=True)
        sys.exit(1)
    else:
        cap_count = len(decl.capabilities) if decl.capabilities else 0
        click.echo(f"valid ({decl.service.name}, {cap_count} capabilities)")


@main.command()
@click.option('--file', '-f', default='paso.yaml', help='Path to paso.yaml file')
def serve(file):
    """Parse, validate, and serve a Paso declaration as an MCP server on stdio."""
    try:
        decl = parse_file(file)
    except FileNotFoundError:
        click.echo(f"Error: file '{file}' not found", err=True)
        sys.exit(1)
    except Exception as e:
        click.echo(f"Error parsing {file}: {str(e)}", err=True)
        sys.exit(1)

    errors = validate(decl)

    if errors:
        click.echo(f"Validation failed with {len(errors)} error(s):", err=True)
        for error in errors:
            click.echo(f"  {error.path}: {error.message}", err=True)
        sys.exit(1)

    cap_count = len(decl.capabilities) if decl.capabilities else 0
    click.echo(
        f"Starting MCP server: {decl.service.name} ({cap_count} capabilities)",
        err=True
    )

    serve_mcp(decl)


if __name__ == '__main__':
    main()
