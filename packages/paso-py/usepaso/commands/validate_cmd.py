import json
import sys

import click

from usepaso.parser import parse_file
from usepaso.validator import validate
from usepaso.commands.shared import load_and_validate
from usepaso.utils.color import green, cyan, yellow, dim


def _strict_checks(decl):
    """Run best-practice checks beyond basic validation. Returns list of warning strings."""
    warnings = []
    for cap in (decl.capabilities or []):
        if cap.method == 'DELETE' and not cap.consent_required:
            warnings.append(f'{cap.name}: DELETE without consent_required — agents could delete data without user approval')
        if cap.description and len(cap.description) < 10:
            warnings.append(f'{cap.name}: description is very short ({len(cap.description)} chars) — agents need clear descriptions to use tools correctly')
        perm = cap.permission or ''
        constraints = cap.constraints if hasattr(cap, 'constraints') and cap.constraints else []
        if perm in ('write', 'admin') and not constraints:
            warnings.append(f'{cap.name}: {perm} capability with no constraints — consider adding rate limits or guardrails')
    if not decl.permissions:
        warnings.append('No permissions section defined — all capabilities are accessible by default')
    return warnings


def register(cli_group):
    @cli_group.command('validate')
    @click.option('--file', '-f', default='usepaso.yaml', help='Path to usepaso.yaml file')
    @click.option('--json', 'as_json', is_flag=True, help='Output result as JSON')
    @click.option('--strict', is_flag=True, help='Enable best-practice checks')
    def validate_cmd(file, as_json, strict):
        """Validate a usepaso.yaml file."""

        if as_json:
            try:
                decl = parse_file(file)
            except FileNotFoundError:
                click.echo(json.dumps({
                    "valid": False, "service": None, "capabilities": 0,
                    "errors": [{"path": "", "message": f"File not found: {file}"}],
                    "warnings": [],
                }))
                sys.exit(1)
            except Exception as e:
                click.echo(json.dumps({
                    "valid": False, "service": None, "capabilities": 0,
                    "errors": [{"path": "", "message": str(e)}],
                    "warnings": [],
                }))
                sys.exit(1)

            results = validate(decl)
            errors = [e for e in results if e.level != 'warning']
            warnings = [e for e in results if e.level == 'warning']
            valid = len(errors) == 0
            all_warnings = [{"path": e.path, "message": e.message} for e in warnings]
            bp_warnings = _strict_checks(decl) if strict and valid else []
            for w in bp_warnings:
                all_warnings.append({"path": "strict", "message": w})
            report_valid = valid and (not strict or len(bp_warnings) == 0)
            click.echo(json.dumps({
                "valid": report_valid,
                "service": decl.service.name if decl.service else None,
                "capabilities": len(decl.capabilities) if decl.capabilities else 0,
                "errors": [{"path": e.path, "message": e.message} for e in errors],
                "warnings": all_warnings,
            }))
            if not valid:
                sys.exit(1)
            if strict and bp_warnings:
                sys.exit(1)
            return

        decl = load_and_validate(file)
        cap_count = len(decl.capabilities) if decl.capabilities else 0
        click.echo(f"{green('valid')} ({cyan(decl.service.name)}, {cap_count} capabilities, 0 regrets)")

        if strict:
            bp = _strict_checks(decl)
            if bp:
                click.echo('')
                click.echo(yellow(f'{len(bp)} best-practice warning(s):'))
                for w in bp:
                    click.echo(dim(f'  → {w}'))
                sys.exit(1)
