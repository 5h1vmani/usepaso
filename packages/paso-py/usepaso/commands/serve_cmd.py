import os
import sys

import click

from usepaso.commands.shared import load_and_validate, mcp_config_snippet
from usepaso.utils.color import green, cyan, yellow
from usepaso.utils.redact import redact_url


def register(cli_group):
    @cli_group.command()
    @click.option('--file', '-f', default='usepaso.yaml', help='Path to usepaso.yaml file')
    @click.option('--verbose', '-v', is_flag=True, help='Log all requests to stderr')
    @click.option('--watch', '-w', is_flag=True, help='Notify when usepaso.yaml changes (requires manual restart)')
    def serve(file, verbose, watch):
        """Start an MCP server from a usepaso.yaml declaration."""
        from usepaso.generators.mcp import serve_mcp
        from pathlib import Path

        decl = load_and_validate(file)
        cap_count = len(decl.capabilities) if decl.capabilities else 0

        auth_token = os.environ.get('USEPASO_AUTH_TOKEN')
        if auth_token is not None and auth_token == '':
            click.echo(yellow('Warning: USEPASO_AUTH_TOKEN is set but empty. API requests will likely fail.'), err=True)
        if decl.service.auth:
            if decl.service.auth.type == 'none' and auth_token:
                click.echo(yellow('Note: auth.type is "none" — ignoring USEPASO_AUTH_TOKEN'), err=True)
            elif decl.service.auth.type != 'none' and not auth_token:
                click.echo(yellow(
                    f'Warning: auth type "{decl.service.auth.type}" is configured but USEPASO_AUTH_TOKEN is not set. API requests will likely fail with 401.'
                ), err=True)

        # Security: warn if base_url uses plain HTTP
        if decl.service.base_url.startswith('http://'):
            click.echo(yellow('Warning: base_url uses http://. Auth tokens will be sent in plain text.'), err=True)

        click.echo(f'{green("usepaso serving")} "{cyan(decl.service.name)}" ({cap_count} capabilities). Agents welcome.', err=True)
        click.echo('Transport: stdio. Waiting for an MCP client...', err=True)

        click.echo(mcp_config_snippet(file, decl.service.name), err=True)
        click.echo('', err=True)

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

        on_log = None
        if verbose:
            from datetime import datetime

            def on_log(cap_name, result, _decl):
                now = datetime.now().strftime('%H:%M:%S')
                if result.get('error'):
                    click.echo(f"[{now}] {cap_name} → ERROR: {result['error']}", err=True)
                else:
                    req = result['request']
                    safe_url = redact_url(req['url'])
                    click.echo(
                        f"[{now}] {cap_name} → {req['method']} {safe_url} ← {result.get('status')} ({result['duration_ms']}ms)",
                        err=True
                    )

        serve_mcp(decl, on_log=on_log)
