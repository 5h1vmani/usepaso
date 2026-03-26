"""Tests for new CLI commands: version, doctor."""

import os
import subprocess
import sys
from pathlib import Path

import pytest

EXAMPLES_DIR = Path(__file__).parent / "../../../examples"


def run_cli(*args):
    cmd = [sys.executable, "-m", "usepaso.cli"] + list(args)
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=10,
        env={**os.environ, "NO_COLOR": "1"},
        cwd=str(Path(__file__).parent / ".."),
    )
    return result


class TestVersion:
    def test_prints_version(self):
        result = run_cli("version")
        assert result.returncode == 0
        # Should be a semver-like string
        version = result.stdout.strip()
        assert len(version.split(".")) >= 2

    def test_version_flag(self):
        result = run_cli("--version")
        assert result.returncode == 0
        version = result.stdout.strip()
        assert len(version.split(".")) >= 2


class TestDoctor:
    def test_runs_checks_on_valid_file(self):
        sentry = str(EXAMPLES_DIR / "sentry" / "usepaso.yaml")
        result = run_cli("doctor", "-f", sentry)
        combined = result.stdout + result.stderr
        assert "usepaso doctor" in combined
        assert "YAML parses correctly" in combined
        assert "Validation passes" in combined

    def test_fails_on_missing_file(self):
        result = run_cli("doctor", "-f", "nonexistent.yaml")
        assert result.returncode == 1
        combined = result.stdout + result.stderr
        assert "FAIL" in combined
