"""CLI output parity tests using shared fixtures."""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

FIXTURES_DIR = Path(__file__).parent / "../../../test-fixtures/cli-output"


def load_fixtures():
    fixtures = []
    for f in sorted(FIXTURES_DIR.glob("*.yaml")):
        with open(f) as fh:
            data = yaml.safe_load(fh)
        fixtures.append(pytest.param(data, id=f.stem))
    return fixtures


def run_cli(command: str, file: str, fixture_dir: Path):
    file_path = str((fixture_dir / file).resolve())
    args = command.split()
    cmd = [sys.executable, "-m", "usepaso.cli", args[0], "-f", file_path] + args[1:]

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=10,
        env={**os.environ, "NO_COLOR": "1"},
        cwd=str(Path(__file__).parent / ".."),
    )
    return result


@pytest.mark.parametrize("fixture", load_fixtures())
def test_cli_parity(fixture):
    result = run_cli(fixture["command"], fixture["file"], FIXTURES_DIR)

    assert result.returncode == fixture["expected_exit_code"], (
        f"Expected exit code {fixture['expected_exit_code']}, got {result.returncode}.\n"
        f"stdout: {result.stdout}\nstderr: {result.stderr}"
    )

    if "expected_stdout_contains" in fixture:
        for needle in fixture["expected_stdout_contains"]:
            assert needle in result.stdout, (
                f"Expected stdout to contain '{needle}'.\nGot: {result.stdout}"
            )

    if "expected_stderr_contains" in fixture:
        combined = result.stdout + result.stderr
        for needle in fixture["expected_stderr_contains"]:
            assert needle in combined, (
                f"Expected output to contain '{needle}'.\nstdout: {result.stdout}\nstderr: {result.stderr}"
            )

    if "expected_stdout_json" in fixture:
        parsed = json.loads(result.stdout.strip())
        for key, value in fixture["expected_stdout_json"].items():
            assert parsed[key] == value, (
                f"Expected JSON key '{key}' = {value}, got {parsed.get(key)}"
            )
