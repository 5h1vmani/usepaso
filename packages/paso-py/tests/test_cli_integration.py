"""End-to-end CLI integration tests — runs the CLI as a subprocess."""

import json
import os
import subprocess
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent.parent
SENTRY_YAML = ROOT / "examples" / "sentry" / "usepaso.yaml"
CLI_MODULE = "usepaso.cli"


def run(args: list[str], cwd: str | None = None, env_extra: dict | None = None):
    """Run the CLI and return (stdout, stderr, exit_code)."""
    env = {**os.environ, "NO_COLOR": "1"}
    if env_extra:
        env.update(env_extra)
    result = subprocess.run(
        ["python", "-m", CLI_MODULE, *args],
        capture_output=True,
        text=True,
        cwd=cwd,
        env=env,
        timeout=10,
    )
    return result.stdout, result.stderr, result.returncode


class TestValidate:
    def test_succeeds_on_valid_file(self):
        stdout, _, code = run(["validate", "-f", str(SENTRY_YAML)])
        assert code == 0
        assert "valid" in stdout
        assert "Sentry" in stdout
        assert "0 regrets" in stdout

    def test_fails_on_nonexistent_file(self):
        _, stderr, code = run(["validate", "-f", "/tmp/nonexistent.yaml"])
        assert code == 1
        assert "not found" in stderr.lower() or "not found" in stderr

    def test_json_output(self):
        stdout, _, code = run(["validate", "-f", str(SENTRY_YAML), "--json"])
        assert code == 0
        parsed = json.loads(stdout)
        assert parsed["valid"] is True


class TestInspect:
    def test_json_output(self):
        stdout, _, code = run(["inspect", "-f", str(SENTRY_YAML), "--json"])
        assert code == 0
        parsed = json.loads(stdout)
        assert "service" in parsed
        assert "tools" in parsed


class TestDryRun:
    def test_shows_method_and_url(self):
        stdout, _, code = run([
            "test", "list_issues", "-f", str(SENTRY_YAML), "--dry-run",
            "--param", "organization_slug=acme",
            "--param", "project_slug=backend",
        ])
        assert code == 0
        assert "GET" in stdout
        assert "sentry.io" in stdout


class TestTestNoArgs:
    def test_lists_capabilities(self):
        stdout, stderr, code = run(["test", "-f", str(SENTRY_YAML)])
        output = stdout + stderr
        assert "list_issues" in output


class TestInit:
    def test_creates_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            stdout, _, code = run(["init", "--name", "TestService"], cwd=tmpdir)
            assert code == 0
            assert "Created" in stdout
            assert "Next steps" in stdout
            assert (Path(tmpdir) / "usepaso.yaml").exists()

    def test_refuses_to_overwrite(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create the file first
            run(["init", "--name", "TestService"], cwd=tmpdir)
            # Try again
            _, stderr, code = run(["init", "--name", "TestService"], cwd=tmpdir)
            assert code == 1
            assert "already exists" in stderr


class TestDoctor:
    def test_runs_checks(self):
        stdout, stderr, code = run(["doctor", "-f", str(SENTRY_YAML)])
        output = stdout + stderr
        assert "usepaso.yaml found" in output
        assert "YAML parses correctly" in output
        assert "Validation passes" in output
        # Exit code 0 if all pass, 1 if some fail (auth token missing, URL unreachable)
        assert code in (0, 1)


class TestVersion:
    def test_prints_version(self):
        stdout, _, code = run(["version"])
        assert code == 0
        assert stdout.strip()[0].isdigit()


class TestHelp:
    def test_shows_all_commands(self):
        stdout, _, code = run(["--help"])
        assert code == 0
        assert "validate" in stdout
        assert "inspect" in stdout
        assert "serve" in stdout
        assert "test" in stdout
        assert "init" in stdout
        assert "doctor" in stdout
        assert "version" in stdout
        assert "completion" in stdout


class TestTestAll:
    def test_all_dry_run(self):
        stdout, _, code = run(["test", "--all", "--dry-run", "-f", str(SENTRY_YAML)])
        assert code == 0
        assert "list_issues" in stdout
        assert "passed" in stdout
        assert "capabilities total" in stdout

    def test_all_requires_dry_run(self):
        _, stderr, code = run(["test", "--all", "-f", str(SENTRY_YAML)])
        assert code == 1
        assert "--all requires --dry-run" in stderr


class TestValidateStrict:
    def test_reports_best_practice_warnings(self):
        stdout, stderr, code = run(["validate", "--strict", "-f", str(SENTRY_YAML)])
        output = stdout + stderr
        assert "best-practice" in output


class TestCompletion:
    def test_bash_completion(self):
        stdout, _, code = run(["completion"])
        assert code == 0
        assert "complete" in stdout
        assert "usepaso" in stdout

    def test_zsh_completion(self):
        stdout, _, code = run(["completion", "--shell", "zsh"])
        assert code == 0
        assert "compdef" in stdout
