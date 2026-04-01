import os
import sys
from pathlib import Path

import click

from usepaso.parser import parse_file
from usepaso.validator import validate
from usepaso.utils.color import green, red, cyan, dim, yellow
from usepaso.utils.env import load_env_file, is_env_tracked_by_git


def register(cli_group):
    @cli_group.command()
    @click.option('--file', '-f', default='usepaso.yaml', help='Path to usepaso.yaml file')
    @click.option('--env', 'env_file', default=None, help='Path to .env file (default: .env next to usepaso.yaml)')
    def doctor(file, env_file):
        """Check your usepaso setup for common issues."""
        file_path = str(Path(file).resolve()) if not Path(file).is_absolute() else file
        failed = 0

        def ok(label, detail=None):
            suffix = f" {dim(f'({detail})')}" if detail else ""
            click.echo(f"  {green('ok')}   {label}{suffix}", err=True)

        def fail(label, hint):
            nonlocal failed
            click.echo(f"  {red('FAIL')} {label}", err=True)
            click.echo(f"  {dim('│')}    {dim(hint)}", err=True)
            failed += 1

        click.echo('', err=True)
        click.echo(cyan('usepaso doctor'), err=True)
        click.echo('', err=True)

        # 1. File exists
        if not Path(file_path).exists():
            fail('usepaso.yaml found', 'Run usepaso init to create one.')
            click.echo('', err=True)
            click.echo(f'{failed} check failed.', err=True)
            sys.exit(1)
        ok('usepaso.yaml found')

        # 2. YAML parses
        decl = None
        try:
            decl = parse_file(file_path)
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

        # 4. .env file
        directory = str(Path(file_path).parent)
        env_path = Path(env_file) if env_file else Path(directory) / '.env'
        if env_path.exists():
            load_env_file(file_path, env_file)
            ok('.env file found', str(env_path) if env_file else None)
            if is_env_tracked_by_git(str(env_path.parent)):
                click.echo(f"  {yellow('WARN')} .env is tracked by git. Run: git rm --cached .env", err=True)
            # Check file permissions on Unix (skip on Windows)
            if sys.platform != 'win32':
                try:
                    mode = env_path.stat().st_mode
                    others_read = mode & 0o004
                    if others_read:
                        click.echo(f"  {yellow('WARN')} .env is world-readable. Run: chmod 600 .env", err=True)
                except Exception:
                    pass
        else:
            ok('.env file', 'not found, using environment variables')

        # 5. Auth token
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

        # 6. Base URL reachable
        base_url = decl.service.base_url if decl.service else None
        if base_url:
            try:
                import httpx
                import time
                start = time.time()
                httpx.head(base_url, timeout=5.0)
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
