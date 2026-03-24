# Tech debt: This file contains all CLI commands in a single module (~350 lines).
# The JS SDK splits commands into separate files (src/commands/*.ts).
# Refactor this into paso/commands/{init,validate,inspect,test,serve}.py when:
#   - We add 2+ more commands, OR
#   - Any single command exceeds 100 lines
# Click's decorator pattern makes this harder than commander — will need a
# registration pattern like: each command module exports a function that takes
# the click group and registers itself.

import asyncio
import os
import sys
from importlib.metadata import version as pkg_version

import click
from pathlib import Path
from paso.parser import parse_file
from paso.validator import validate
from paso.generators.mcp import serve_mcp

try:
    __version__ = pkg_version('usepaso')
except Exception:
    __version__ = '0.0.0'


FALLBACK_TEMPLATE = "version: \"1.0\"\n\nservice:\n  name: __SERVICE_NAME__\n  description: TODO — describe what your service does\n  base_url: https://api.example.com\n  auth:\n    type: bearer\n\ncapabilities:\n  - name: example_action\n    description: TODO — describe what this action does\n    method: GET\n    path: /example\n    permission: read\n    inputs:\n      id:\n        type: string\n        required: true\n        description: TODO — describe this parameter\n        in: query\n    output:\n      result:\n        type: string\n        description: TODO — describe the output\n\npermissions:\n  read:\n    - example_action\n"


def _load_template() -> str:
    """Load init template from shared examples/template/usepaso.yaml, fallback to inline."""
    candidates = [
        Path(__file__).parent / '..' / '..' / '..' / 'examples' / 'template' / 'usepaso.yaml',
        Path(__file__).parent / '..' / '..' / 'examples' / 'template' / 'usepaso.yaml',
    ]
    for p in candidates:
        resolved = p.resolve()
        if resolved.exists():
            return resolved.read_text(encoding='utf-8')
    return FALLBACK_TEMPLATE


def _load_and_validate(file_path):
    """Load and validate a usepaso.yaml, exit on error."""
    try:
        decl = parse_file(file_path)
    except FileNotFoundError:
        click.echo(f"Error: file '{file_path}' not found", err=True)
        sys.exit(1)
    except Exception as e:
        click.echo(f"Error parsing {file_path}: {e}", err=True)
        sys.exit(1)

    results = validate(decl)
    errors = [e for e in results if e.level != 'warning']
    warnings = [e for e in results if e.level == 'warning']

    if errors:
        click.echo(f"Validation failed with {len(errors)} error(s):", err=True)
        for error in errors:
            click.echo(f"  {error.path}: {error.message}", err=True)
        sys.exit(1)

    for w in warnings:
        click.echo(f"  warning: {w.path}: {w.message}", err=True)

    return decl


def _mcp_config_snippet(file_path, service_name):
    abs_path = str(Path(file_path).resolve())
    slug = service_name.lower()
    import re
    slug = re.sub(r'[^a-z0-9]+', '-', slug).strip('-')
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


@click.group()
@click.version_option(version=__version__, prog_name='usepaso')
def main():
    """usepaso — Make your API agent-ready in minutes."""
    pass


# ---- init ----

@main.command()
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
        from paso.openapi import generate_from_openapi

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

            click.echo(f"Generated usepaso.yaml from {source}")
            click.echo(f"  Service:      {result['service_name']}")
            click.echo(f"  Capabilities: {result['generated_count']} ({result['read_count']} read, {result['write_count']} write, {result['admin_count']} admin)")
            click.echo(f"  Auth:         {result['auth_type']}")
            if result['total_operations'] > result['generated_count']:
                click.echo(f"  Note: {result['total_operations']} operations found, capped at {result['generated_count']}. Edit usepaso.yaml to add more.")
            click.echo("Review the file, then run: usepaso validate")
        except Exception as e:
            click.echo(f"Failed to convert OpenAPI spec: {e}", err=True)
            sys.exit(1)
        return

    template = _load_template()
    content = template.replace('__SERVICE_NAME__', name)
    paso_file.write_text(content, encoding='utf-8')
    click.echo(f"Created usepaso.yaml with service name '{name}'")


# ---- validate ----

@main.command('validate')
@click.option('--file', '-f', default='usepaso.yaml', help='Path to usepaso.yaml file')
def validate_cmd(file):
    """Validate a usepaso.yaml file."""
    decl = _load_and_validate(file)
    cap_count = len(decl.capabilities) if decl.capabilities else 0
    click.echo(f"valid ({decl.service.name}, {cap_count} capabilities)")


# ---- inspect ----

@main.command('inspect')
@click.option('--file', '-f', default='usepaso.yaml', help='Path to usepaso.yaml file')
def inspect_cmd(file):
    """Show what MCP tools would be generated (dry run)."""
    decl = _load_and_validate(file)

    forbidden = set(decl.permissions.forbidden) if decl.permissions and decl.permissions.forbidden else set()
    tools = [c for c in decl.capabilities if c.name not in forbidden]

    click.echo(f"Service: {decl.service.name}")
    click.echo(f"Tools:   {len(tools)}")
    click.echo(f"Auth:    {decl.service.auth.type if decl.service.auth else 'none'}")
    click.echo("")

    for tool in tools:
        badge = " [consent required]" if tool.consent_required else ""
        click.echo(f"  {tool.name} ({tool.permission}){badge}")
        click.echo(f"    {tool.method} {tool.path}")
        click.echo(f"    {tool.description}")
        if tool.inputs:
            params = ", ".join(
                f"{k}{'*' if v.required else ''}: {v.type}"
                for k, v in tool.inputs.items()
            )
            click.echo(f"    params: {params}")
        click.echo("")

    if decl.permissions and decl.permissions.forbidden:
        click.echo(f"Forbidden: {', '.join(decl.permissions.forbidden)}")


import re as _re

_INTEGER_RE = _re.compile(r'^-?\d+$')
_NUMBER_RE = _re.compile(r'^-?\d+(\.\d+)?$')


def _coerce_value(raw: str, declared_type: str, key: str):
    """Coerce a CLI string value to the declared input type. Raises ValueError on invalid input."""
    if declared_type == 'integer':
        if not _INTEGER_RE.match(raw):
            raise ValueError(f'Parameter "{key}" must be an integer, got "{raw}"')
        return int(raw)
    elif declared_type == 'number':
        if not _NUMBER_RE.match(raw):
            raise ValueError(f'Parameter "{key}" must be a number, got "{raw}"')
        return float(raw)
    elif declared_type == 'boolean':
        if raw == 'true':
            return True
        elif raw == 'false':
            return False
        raise ValueError(f'Parameter "{key}" must be true or false, got "{raw}"')
    else:
        # string, enum, array, object — keep as string
        return raw


# ---- test ----

@main.command('test')
@click.argument('capability')
@click.option('--file', '-f', default='usepaso.yaml', help='Path to usepaso.yaml file')
@click.option('--param', '-p', multiple=True, help='Parameters as key=value (repeatable)')
@click.option('--dry-run', is_flag=True, help='Show the HTTP request without executing it')
def test_cmd(capability, file, param, dry_run):
    """Test a capability by making the actual HTTP request (or --dry-run to preview)."""
    from paso.executor import build_request, execute_request, format_error

    decl = _load_and_validate(file)

    # Auth notice (once, not per-request)
    if decl.service.auth and decl.service.auth.type == 'none' and os.environ.get('USEPASO_AUTH_TOKEN'):
        click.echo('Note: auth.type is "none" — ignoring USEPASO_AUTH_TOKEN', err=True)

    cap = None
    for c in decl.capabilities:
        if c.name == capability:
            cap = c
            break

    if not cap:
        names = ', '.join(c.name for c in decl.capabilities)
        click.echo(f'Capability "{capability}" not found.', err=True)
        click.echo(f'Available: {names}', err=True)
        sys.exit(1)

    # Parse params using declared input types
    args = {}
    param_errors = []
    for p in param:
        eq = p.find('=')
        if eq == -1:
            param_errors.append(f'Invalid param format: "{p}". Use key=value.')
            continue
        key = p[:eq]
        raw = p[eq + 1:]
        input_def = cap.inputs.get(key) if cap.inputs else None
        if input_def:
            try:
                args[key] = _coerce_value(raw, input_def.type, key)
            except ValueError as e:
                param_errors.append(str(e))
        else:
            args[key] = raw

    # Check required params
    if cap.inputs:
        for name, inp in cap.inputs.items():
            if inp.required and name not in args:
                param_errors.append(f"Missing required parameter: {name} ({inp.description})")

    if param_errors:
        for err in param_errors:
            click.echo(err, err=True)
        sys.exit(1)

    auth_token = os.environ.get('USEPASO_AUTH_TOKEN')
    req = build_request(cap, args, decl, auth_token=auth_token)

    if dry_run:
        click.echo("--- DRY RUN (no request will be made) ---")
        click.echo("")
        click.echo(f"{req['method']} {req['url']}")
        for k, v in req['headers'].items():
            token = os.environ.get('USEPASO_AUTH_TOKEN', '')
            display = f"{v[:12]}..." if token and len(token) >= 8 and token in v else v
            click.echo(f"{k}: {display}")
        if req.get('body'):
            click.echo("")
            click.echo(req['body'])
        return

    click.echo(f"Testing {cap.name}...")
    click.echo(f"→ {req['method']} {req['url']}")
    if req.get('body'):
        click.echo(f"→ Body: {req['body']}")
    click.echo("")

    result = asyncio.run(execute_request(req))

    if result.get('error'):
        click.echo(format_error(result, decl, auth_token=auth_token), err=True)
        sys.exit(1)

    click.echo(f"← {result['status']} {result.get('status_text', '')} ({result['duration_ms']}ms)")
    click.echo("")

    if result.get('status', 0) >= 400:
        click.echo(format_error(result, decl, auth_token=auth_token), err=True)
        sys.exit(1)

    click.echo(result['body'])


# ---- serve ----

@main.command()
@click.option('--file', '-f', default='usepaso.yaml', help='Path to usepaso.yaml file')
@click.option('--verbose', '-v', is_flag=True, help='Log all requests to stderr')
@click.option('--watch', '-w', is_flag=True, help='Notify when usepaso.yaml changes (requires manual restart)')
def serve(file, verbose, watch):
    """Start an MCP server from a usepaso.yaml declaration."""
    decl = _load_and_validate(file)

    cap_count = len(decl.capabilities) if decl.capabilities else 0

    # Auth notices (logged once at startup, not per-request)
    if decl.service.auth:
        if decl.service.auth.type == 'none' and os.environ.get('USEPASO_AUTH_TOKEN'):
            click.echo('Note: auth.type is "none" — ignoring USEPASO_AUTH_TOKEN', err=True)
        elif decl.service.auth.type != 'none' and not os.environ.get('USEPASO_AUTH_TOKEN'):
            click.echo(
                f'Warning: auth type "{decl.service.auth.type}" is configured but USEPASO_AUTH_TOKEN is not set. API requests will likely fail with 401.',
                err=True
            )

    click.echo(f'usepaso serving "{decl.service.name}" ({cap_count} capabilities)', err=True)
    click.echo('Transport: stdio — waiting for MCP client...', err=True)

    # MCP config snippet
    click.echo(_mcp_config_snippet(file, decl.service.name), err=True)
    click.echo('', err=True)

    # Watch mode
    if watch:
        import threading
        import time

        def watch_file():
            last_mtime = Path(file).stat().st_mtime
            while True:
                time.sleep(1)
                try:
                    current_mtime = Path(file).stat().st_mtime
                    if current_mtime != last_mtime:
                        last_mtime = current_mtime
                        click.echo(f"\nFile changed. Restart the server to pick up changes.", err=True)
                except Exception:
                    pass

        t = threading.Thread(target=watch_file, daemon=True)
        t.start()
        click.echo(f"Watching {file} for changes...", err=True)

    # Verbose logging callback
    on_log = None
    if verbose:
        from datetime import datetime

        def on_log(cap_name, result, _decl):
            now = datetime.now().strftime('%H:%M:%S')
            if result.get('error'):
                click.echo(f"[{now}] {cap_name} → ERROR: {result['error']}", err=True)
            else:
                req = result['request']
                click.echo(
                    f"[{now}] {cap_name} → {req['method']} {req['url']} ← {result.get('status')} ({result['duration_ms']}ms)",
                    err=True
                )

    serve_mcp(decl, on_log=on_log)


if __name__ == '__main__':
    main()
