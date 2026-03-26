import json
import os
from pathlib import Path
from urllib.parse import urlparse, parse_qs

import pytest
import yaml

from usepaso.parser import parse_string
from usepaso.executor import build_request

FIXTURES_DIR = Path(__file__).parent / "../../../test-fixtures/build-request"


def load_fixtures():
    fixtures = []
    for f in sorted(FIXTURES_DIR.glob("*.yaml")):
        with open(f) as fh:
            data = yaml.safe_load(fh)
        fixtures.append(pytest.param(data, id=f.stem))
    return fixtures


@pytest.mark.parametrize("fixture", load_fixtures())
def test_shared_fixture(fixture, monkeypatch):
    decl_yaml = yaml.dump(fixture["declaration"])
    decl = parse_string(decl_yaml)
    cap = next(c for c in decl.capabilities if c.name == fixture["capability"])

    # Set env vars
    if "env" in fixture:
        for k, v in fixture["env"].items():
            monkeypatch.setenv(k, v)

    auth_token = fixture.get("env", {}).get("USEPASO_AUTH_TOKEN")
    req = build_request(cap, fixture.get("args", {}), decl, auth_token=auth_token)
    expected = fixture["expected"]

    assert req["method"] == expected["method"]

    if "url" in expected:
        assert req["url"] == expected["url"]

    if "url_contains" in expected:
        parsed = urlparse(req["url"])
        base = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
        assert base == expected["url_contains"]["base"]
        params = parse_qs(parsed.query)
        for k, v in expected["url_contains"]["params"].items():
            assert params.get(k) == [v], f"Expected {k}={v}, got {params.get(k)}"

    if "headers" in expected:
        for k, v in expected["headers"].items():
            assert req["headers"].get(k) == v, f"Expected header {k}={v}"

    if "headers_absent" in expected:
        for h in expected["headers_absent"]:
            assert h not in req["headers"], f"Header {h} should not be present"

    if "body_contains" in expected:
        body = json.loads(req["body"])
        for k, v in expected["body_contains"].items():
            assert body[k] == v, f"Expected body.{k}={v}"
