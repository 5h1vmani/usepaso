import asyncio
import os
import sys

import click

from usepaso.commands.shared import load_and_validate
from usepaso.utils.coerce import coerce_value
from usepaso.utils.color import green, cyan, dim


def register(cli_group):
    @cli_group.command('test')
    @click.argument('capability', required=False)
    @click.option('--file', '-f', default='usepaso.yaml', help='Path to usepaso.yaml file')
    @click.option('--param', '-p', multiple=True, help='Parameters as key=value (repeatable)')
    @click.option('--dry-run', is_flag=True, help='Show the HTTP request without executing it')
    @click.option('--all', 'all_caps', is_flag=True, help='Test all capabilities (requires --dry-run)')
    @click.option('--timeout', default=30, type=float, help='Request timeout in seconds (default: 30)')
    def test_cmd(capability, file, param, dry_run, all_caps, timeout):
        """Test a capability against the live API (or --dry-run, minus the consequences)."""
        from usepaso.executor import build_request, execute_request, format_error

        decl = load_and_validate(file)

        # --all mode: dry-run all capabilities
        if all_caps:
            if not dry_run:
                click.echo('--all requires --dry-run. Running all capabilities against a live API is not supported.', err=True)
                sys.exit(1)
            auth_token = os.environ.get('USEPASO_AUTH_TOKEN')
            passed = 0
            failed = 0
            for cap in decl.capabilities:
                args = {}
                if cap.inputs:
                    for name, inp in cap.inputs.items():
                        if inp.default is not None:
                            args[name] = inp.default
                        elif inp.required:
                            if inp.type == 'integer':
                                args[name] = 0
                            elif inp.type == 'boolean':
                                args[name] = False
                            else:
                                args[name] = f'{{{name}}}'
                try:
                    req = build_request(cap, args, decl, auth_token=auth_token)
                    method = req['method']
                    url = req['url']
                    click.echo(f"{green('ok')} {cyan(cap.name)} {dim(f'{method} {url}')}")
                    passed += 1
                except Exception as e:
                    click.echo(f"FAIL {cap.name}: {e}", err=True)
                    failed += 1
            click.echo('')
            fail_msg = f', {failed} failed' if failed > 0 else ''
            click.echo(f'{passed} passed{fail_msg}. {len(decl.capabilities)} capabilities total.')
            if failed > 0:
                sys.exit(1)
            return

        # No capability specified — list available ones
        if not capability:
            click.echo('Missing capability name. Available capabilities:\n')
            for c in decl.capabilities:
                click.echo(f"  {cyan(c.name)} {dim(f'({c.permission})')}  {dim(c.description)}")
            click.echo(f'\nUsage: usepaso test <capability> [--param key=value]')
            return

        auth_token = os.environ.get('USEPASO_AUTH_TOKEN')
        if auth_token is not None and auth_token == '':
            click.echo('Warning: USEPASO_AUTH_TOKEN is set but empty. API requests will likely fail.', err=True)
        if decl.service.auth and decl.service.auth.type == 'none' and auth_token:
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
                    args[key] = coerce_value(raw, input_def.type, key)
                except ValueError as e:
                    param_errors.append(str(e))
            else:
                args[key] = raw
                click.echo(
                    f'Warning: unknown parameter "{key}" — not declared in inputs for {capability}',
                    err=True,
                )

        if cap.inputs:
            for name, inp in cap.inputs.items():
                if inp.required and name not in args:
                    param_errors.append(f"Missing required parameter: {name} ({inp.description})")

        if param_errors:
            for err in param_errors:
                click.echo(err, err=True)
            sys.exit(1)

        req = build_request(cap, args, decl, auth_token=auth_token)

        if dry_run:
            click.echo(dim("--- DRY RUN (no request will be made) ---"))
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

        click.echo(f"Testing {cyan(cap.name)}...")
        click.echo(dim(f"→ {req['method']} {req['url']}"))
        if req.get('body'):
            click.echo(f"→ Body: {req['body']}")
        click.echo("")

        result = asyncio.run(execute_request(req, timeout=timeout))

        if result.get('error'):
            click.echo(format_error(result, decl, auth_token=auth_token), err=True)
            sys.exit(1)

        click.echo(green(f"← {result['status']} {result.get('status_text', '')}") + dim(f" ({result['duration_ms']}ms)"))
        click.echo("")

        if result.get('status', 0) >= 400:
            click.echo(format_error(result, decl, auth_token=auth_token), err=True)
            sys.exit(1)

        click.echo(result['body'])
