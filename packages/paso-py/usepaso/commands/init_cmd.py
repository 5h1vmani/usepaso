import sys
from pathlib import Path

import click

from usepaso.utils.color import green, cyan, dim


FALLBACK_TEMPLATE = "# yaml-language-server: $schema=https://raw.githubusercontent.com/5h1vmani/usepaso/main/spec/usepaso.schema.json\nversion: \"1.0\"\n\nservice:\n  name: __SERVICE_NAME__\n  description: TODO — describe what your service does\n  base_url: https://api.example.com\n  auth:\n    type: bearer\n\ncapabilities:\n  - name: example_action\n    description: TODO — describe what this action does\n    method: GET\n    path: /example\n    permission: read\n    inputs:\n      id:\n        type: string\n        required: true\n        description: TODO — describe this parameter\n        in: query\n    output:\n      result:\n        type: string\n        description: TODO — describe the output\n\npermissions:\n  read:\n    - example_action\n"


def _load_template() -> str:
    """Load init template from shared examples/template/usepaso.yaml, fallback to inline."""
    candidates = [
        Path(__file__).parent / '..' / '..' / '..' / 'examples' / 'template' / 'usepaso.yaml',
        Path(__file__).parent / '..' / '..' / '..' / '..' / 'examples' / 'template' / 'usepaso.yaml',
    ]
    for p in candidates:
        resolved = p.resolve()
        if resolved.exists():
            return resolved.read_text(encoding='utf-8')
    return FALLBACK_TEMPLATE


def register(cli_group):
    @cli_group.command()
    @click.option('--name', default='MyService', help='Service name for usepaso.yaml')
    @click.option('--from-openapi', default=None, help='Generate from an OpenAPI 3.x spec (JSON, YAML, or URL)')
    def init(name, from_openapi):
        """Initialize a new usepaso.yaml file in the current directory."""
        paso_file = Path('usepaso.yaml')

        if paso_file.exists():
            click.echo("Error: usepaso.yaml already exists in this directory", err=True)
            sys.exit(1)

        if from_openapi:
            import json
            import yaml as yaml_lib
            from usepaso.openapi import generate_from_openapi

            source = from_openapi

            try:
                if source.startswith('http://') or source.startswith('https://'):
                    import httpx
                    resp = httpx.get(source, timeout=30)
                    resp.raise_for_status()
                    spec_content = resp.text
                else:
                    spec_path = Path(source)
                    if not spec_path.exists():
                        click.echo(f"Error: OpenAPI spec not found: {source}", err=True)
                        sys.exit(1)
                    spec_content = spec_path.read_text(encoding='utf-8')

                try:
                    spec = json.loads(spec_content)
                except json.JSONDecodeError:
                    spec = yaml_lib.safe_load(spec_content)

                result = generate_from_openapi(spec)
                paso_file.write_text(result['yaml'], encoding='utf-8')

                click.echo(green(f"Generated usepaso.yaml from {source}"))
                click.echo(f"  Service:      {cyan(result['service_name'])}")
                click.echo(f"  Capabilities: {result['generated_count']} ({result['read_count']} read, {result['write_count']} write, {result['admin_count']} admin)")
                click.echo(f"  Auth:         {result['auth_type']}")
                if result['total_operations'] > result['generated_count']:
                    click.echo(f"  Note: {result['total_operations']} operations found, capped at {result['generated_count']}. Edit usepaso.yaml to add more.")
                click.echo('')
                click.echo(dim('Next steps:'))
                click.echo(dim('  1. Review the generated capabilities — remove any you don\'t want exposed'))
                click.echo(dim('  2. usepaso validate         Check for issues'))
                click.echo(dim('  3. usepaso test --dry-run    Preview what agents will see'))
                click.echo(dim('  4. usepaso serve             Start the MCP server'))
            except Exception as e:
                click.echo(f"Failed to convert OpenAPI spec: {e}", err=True)
                sys.exit(1)
            return

        template = _load_template()
        content = template.replace('__SERVICE_NAME__', name)
        paso_file.write_text(content, encoding='utf-8')
        click.echo(green(f'Created usepaso.yaml for "{name}".'))
        click.echo('')
        click.echo(dim('Next steps:'))
        click.echo(dim('  1. Declare your capabilities in usepaso.yaml'))
        click.echo(dim('  2. usepaso validate         Check for issues'))
        click.echo(dim('  3. usepaso test --dry-run    Preview what agents will see'))
        click.echo(dim('  4. usepaso serve             Start the MCP server'))
