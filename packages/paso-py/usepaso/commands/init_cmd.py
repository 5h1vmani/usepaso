import sys
from pathlib import Path

import click

from usepaso.utils.color import green, cyan, dim
from usepaso.utils.env import ensure_gitignore


MAX_SPEC_SIZE = 50 * 1024 * 1024  # 50MB

ENV_EXAMPLE = """# paso auth token. Never commit .env to version control.
USEPASO_AUTH_TOKEN=your-token-here
"""

FALLBACK_TEMPLATE = "# yaml-language-server: $schema=https://raw.githubusercontent.com/5h1vmani/usepaso/main/spec/usepaso.schema.json\nversion: \"1.0\"\n\nservice:\n  name: __SERVICE_NAME__\n  description: TODO: describe what your service does\n  base_url: https://api.example.com\n  auth:\n    type: bearer\n\ncapabilities:\n  - name: example_action\n    description: TODO: describe what this action does\n    method: GET\n    path: /example\n    permission: read\n    inputs:\n      id:\n        type: string\n        required: true\n        description: TODO: describe this parameter\n        in: query\n    output:\n      result:\n        type: string\n        description: TODO: describe the output\n\npermissions:\n  read:\n    - example_action\n"

EXAMPLE_TEMPLATE = """# A working example using JSONPlaceholder (free, public, no auth).
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
"""


def _scaffold_env(out_dir: str) -> None:
    example_path = Path(out_dir) / '.env.example'
    if not example_path.exists():
        example_path.write_text(ENV_EXAMPLE, encoding='utf-8')
    ensure_gitignore(out_dir)


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
    @click.option('--name', '-n', default=None, help='Service name')
    @click.option('--blank', is_flag=True, help='Generate a blank template (instead of the default working example)')
    @click.option('--example', is_flag=True, help='Generate a working example using JSONPlaceholder (same as default)')
    @click.option('--from-openapi', default=None, help='Generate from an OpenAPI 3.x spec (JSON, YAML, or URL)')
    @click.option('--max-capabilities', default=20, type=int, help='Max capabilities to generate from OpenAPI (default: 20)')
    def init(name, blank, example, from_openapi, max_capabilities):
        """Create a usepaso.yaml template in the current directory."""
        paso_file = Path('usepaso.yaml')

        if paso_file.exists():
            click.echo('usepaso.yaml already exists in this directory.', err=True)
            sys.exit(1)

        if blank and from_openapi:
            click.echo('Cannot use --blank and --from-openapi together.', err=True)
            sys.exit(1)

        if from_openapi:
            import json
            import yaml as yaml_lib
            from usepaso.openapi import generate_from_openapi

            source = from_openapi

            try:
                if source.startswith('http://') or source.startswith('https://'):
                    import httpx
                    with httpx.stream('GET', source, timeout=30) as resp:
                        resp.raise_for_status()
                        content_length = resp.headers.get('content-length')
                        if content_length and int(content_length) > MAX_SPEC_SIZE:
                            size_mb = round(int(content_length) / 1024 / 1024)
                            click.echo(f'OpenAPI spec exceeds 50MB limit ({size_mb}MB). Check the URL or use a local file.', err=True)
                            sys.exit(1)
                        chunks = []
                        total_bytes = 0
                        for chunk in resp.iter_bytes():
                            total_bytes += len(chunk)
                            if total_bytes > MAX_SPEC_SIZE:
                                click.echo('OpenAPI spec exceeds 50MB limit. Check the URL or use a local file.', err=True)
                                sys.exit(1)
                            chunks.append(chunk)
                    spec_content = b''.join(chunks).decode('utf-8')
                else:
                    spec_path = Path(source).resolve()
                    if not spec_path.exists():
                        click.echo(f'OpenAPI spec not found: {spec_path}', err=True)
                        sys.exit(1)
                    spec_content = spec_path.read_text(encoding='utf-8')

                try:
                    spec = json.loads(spec_content)
                except json.JSONDecodeError:
                    spec = yaml_lib.safe_load(spec_content)

                if max_capabilities < 1:
                    click.echo('--max-capabilities must be a positive integer.', err=True)
                    sys.exit(1)
                result = generate_from_openapi(spec, max_capabilities=max_capabilities)
                paso_file.write_text(result['yaml'], encoding='utf-8')

                _scaffold_env(str(paso_file.parent))
                click.echo(green(f'Generated usepaso.yaml from {source}'))
                click.echo(f"  Service:      {cyan(result['service_name'])}")
                click.echo(f"  Capabilities: {result['generated_count']} ({result['read_count']} read, {result['write_count']} write, {result['admin_count']} admin)")
                click.echo(f"  Auth:         {result['auth_type']}")
                if result['total_operations'] > result['generated_count']:
                    click.echo(f"  Note: {result['total_operations']} operations found, capped at {result['generated_count']}. Edit usepaso.yaml to add more.")
                click.echo('')
                click.echo(dim('Next steps:'))
                click.echo(dim("  1. Review the generated capabilities. Remove any you don't want exposed"))
                click.echo(dim('  2. usepaso validate         Check for issues'))
                click.echo(dim('  3. usepaso test --dry-run    Preview what agents will see'))
                click.echo(dim('  4. usepaso serve             Start the MCP server'))
            except Exception as e:
                click.echo(f'Failed to convert OpenAPI spec: {e}', err=True)
                sys.exit(1)
            return

        if blank or name:
            svc_name = name or 'MyService'
            template = _load_template().replace('__SERVICE_NAME__', svc_name)
            paso_file.write_text(template, encoding='utf-8')
            _scaffold_env(str(paso_file.parent))
            click.echo(green(f'Created usepaso.yaml for "{svc_name}".'))
            click.echo('')
            click.echo(dim('Next steps:'))
            click.echo(dim('  1. Declare your capabilities in usepaso.yaml'))
            click.echo(dim('  2. Copy .env.example to .env and add your API token'))
            click.echo(dim('  3. usepaso validate         Check for issues'))
            click.echo(dim('  4. usepaso test --dry-run    Preview what agents will see'))
            click.echo(dim('  5. usepaso serve             Start the MCP server'))
            return

        # Default: working example (JSONPlaceholder)
        paso_file.write_text(EXAMPLE_TEMPLATE, encoding='utf-8')
        click.echo(green('Created usepaso.yaml with a working JSONPlaceholder example.'))
        click.echo(dim('No auth needed. No edits needed. Try it now:'))
        click.echo('')
        click.echo(dim('  usepaso validate'))
        click.echo(dim('  usepaso test list_posts --dry-run'))
        click.echo(dim('  usepaso test get_post --param id=1 --dry-run'))
        click.echo(dim('  usepaso serve'))
        click.echo(dim('  usepaso connect cursor         Wire up your IDE'))
        click.echo('')
        click.echo(dim('When you are ready, replace the JSONPlaceholder values with your own API.'))
