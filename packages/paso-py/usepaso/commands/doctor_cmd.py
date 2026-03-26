import os
import sys
from pathlib import Path

import click

from usepaso.parser import parse_file
from usepaso.validator import validate
from usepaso.utils.color import green, red, cyan, dim


def register(cli_group):
    @cli_group.command()
    @click.option('--file', '-f', default='usepaso.yaml', help='Path to usepaso.yaml file')
    def doctor(file):
        """Check your usepaso setup for common issues."""
        file_path = str(Path(file).resolve()) if not Path(file).is_absolute() else file
        passed = 0
        failed = 0

        def ok(label, detail=None):
            nonlocal passed
            suffix = f" {dim(f'({detail})')}" if detail else ""
            click.echo(f"  {green('ok')}   {label}{suffix}", err=True)
            passed += 1

        def fail(label, hint):
            nonlocal failed
            click.echo(f"  {red('FAIL')} {label}", err=True)
            click.echo(f"  {dim('│')}    {dim(hint)}", err=True)
            failed += 1

        click.echo('', err=True)
        click.echo(cyan('usepaso doctor'), err=True)
        click.echo('', err=True)

        # 1. File exists
        if not Path(file).exists():
            fail('usepaso.yaml found', 'Run usepaso init to create one.')
            click.echo('', err=True)
            click.echo(f'{failed} check failed.', err=True)
            sys.exit(1)
        ok('usepaso.yaml found')

        # 2. YAML parses
        decl = None
        try:
            decl = parse_file(file)
            ok('YAML parses correctly')
        except Exception as e:
            fail('YAML parses correctly', str(e))
            click.echo('', err=True)
            click.echo(f'{failed} check(s) failed.', err=True)
            sys.exit(1)

        # 3. Validation
        results = validate(decl)
        errors = [e for e in results if e.level != 'warning']
        warnings = [e for e in results if e.level == 'warning']
        if errors:
            fail('Validation passes', f'{len(errors)} error(s). Run usepaso validate for details.')
        else:
            warn_suffix = f', {len(warnings)} warning(s)' if warnings else ''
            cap_count = len(decl.capabilities) if decl.capabilities else 0
            ok('Validation passes', f'{cap_count} capabilities{warn_suffix}')

        # 4. Auth token
        auth_type = decl.service.auth.type if decl.service and decl.service.auth else None
        token = os.environ.get('USEPASO_AUTH_TOKEN')
        if auth_type and auth_type != 'none':
            if token:
                if token == '':
                    fail('USEPASO_AUTH_TOKEN set', 'Token is empty. Set a valid token.')
                else:
                    ok('USEPASO_AUTH_TOKEN set')
            else:
                fail('USEPASO_AUTH_TOKEN set', 'Set it with: export USEPASO_AUTH_TOKEN=your-token')
        else:
            ok('Auth', 'type is "none", no token needed')

        # 5. Base URL reachable
        base_url = decl.service.base_url if decl.service else None
        if base_url:
            try:
                import httpx
                import time
                start = time.time()
                resp = httpx.head(base_url, timeout=5.0)
                ms = int((time.time() - start) * 1000)
                ok('Base URL reachable', f'{base_url}, {ms}ms')
            except Exception:
                fail('Base URL reachable', f'Could not reach {base_url}. Check the URL and your network.')

        click.echo('', err=True)
        click.echo(dim('─' * 40), err=True)
        if failed == 0:
            click.echo(green('All checks passed.'), err=True)
        else:
            click.echo(f'{red(str(failed))} check(s) failed.', err=True)
            sys.exit(1)
