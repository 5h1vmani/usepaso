"""Tests for the Python MCP generator — mirrors paso-js/tests/mcp.test.ts."""
import os
from pathlib import Path

import pytest

from usepaso.generators.mcp import generate_mcp_server, _build_tool_description
from usepaso.parser import parse_file
from usepaso.types import (
    PasoDeclaration, PasoService, PasoCapability,
    PasoInput, PasoPermissions, PasoConstraint, PasoAuth,
)


def minimal() -> PasoDeclaration:
    return PasoDeclaration(
        version="1.0",
        service=PasoService(
            name="Test",
            description="A test service",
            base_url="https://api.test.com",
        ),
        capabilities=[
            PasoCapability(
                name="get_item",
                description="Get an item by ID",
                method="GET",
                path="/items/{id}",
                permission="read",
                inputs={
                    "id": PasoInput(type="string", required=True, description="Item ID", in_="path"),
                },
            ),
            PasoCapability(
                name="create_item",
                description="Create a new item",
                method="POST",
                path="/items",
                permission="write",
                consent_required=True,
                inputs={
                    "name": PasoInput(type="string", required=True, description="Item name"),
                    "priority": PasoInput(
                        type="enum", description="Priority level",
                        values=["low", "medium", "high"],
                    ),
                },
            ),
        ],
    )


def _get_tools(mcp):
    """Extract registered tool names from a FastMCP server."""
    # FastMCP stores tools in _tool_manager._tools dict
    if hasattr(mcp, '_tool_manager'):
        return list(mcp._tool_manager._tools.keys())
    # Fallback: try direct attribute
    if hasattr(mcp, '_tools'):
        return list(mcp._tools.keys())
    raise RuntimeError("Cannot find tool registry on FastMCP server")


class TestGenerateMcpServer:
    def test_creates_server_from_minimal_declaration(self):
        mcp = generate_mcp_server(minimal())
        assert mcp is not None

    def test_registers_tools_for_each_capability(self):
        mcp = generate_mcp_server(minimal())
        tools = _get_tools(mcp)
        assert len(tools) == 2
        assert "get_item" in tools
        assert "create_item" in tools

    def test_skips_forbidden_capabilities(self):
        decl = minimal()
        decl.permissions = PasoPermissions(forbidden=["create_item"])
        mcp = generate_mcp_server(decl)
        tools = _get_tools(mcp)
        assert len(tools) == 1
        assert "get_item" in tools
        assert "create_item" not in tools

    def test_works_with_sentry_example(self):
        example_path = Path(__file__).parent / ".." / ".." / ".." / "examples" / "sentry" / "usepaso.yaml"
        if not example_path.resolve().exists():
            pytest.skip("Sentry example not found")
        decl = parse_file(str(example_path.resolve()))
        mcp = generate_mcp_server(decl)
        tools = _get_tools(mcp)
        assert len(tools) > 0
        assert "list_issues" in tools
        assert "resolve_issue" in tools

    def test_works_with_stripe_example(self):
        example_path = Path(__file__).parent / ".." / ".." / ".." / "examples" / "stripe" / "usepaso.yaml"
        if not example_path.resolve().exists():
            pytest.skip("Stripe example not found")
        decl = parse_file(str(example_path.resolve()))
        mcp = generate_mcp_server(decl)
        tools = _get_tools(mcp)
        assert "list_customers" in tools
        assert "create_payment_intent" in tools
        assert "delete_customer" not in tools

    def test_handles_capabilities_with_no_inputs(self):
        decl = PasoDeclaration(
            version="1.0",
            service=PasoService(name="Test", description="Test", base_url="https://api.test.com"),
            capabilities=[
                PasoCapability(
                    name="health_check", description="Check health",
                    method="GET", path="/health", permission="read",
                ),
            ],
        )
        mcp = generate_mcp_server(decl)
        tools = _get_tools(mcp)
        assert len(tools) == 1


class TestBuildToolDescription:
    def test_includes_consent_warning(self):
        cap = PasoCapability(
            name="delete_item", description="Delete an item",
            method="DELETE", path="/items/{id}", permission="admin",
            consent_required=True,
        )
        desc = _build_tool_description(cap)
        assert "REQUIRES USER CONSENT" in desc

    def test_includes_constraints(self):
        cap = PasoCapability(
            name="transfer", description="Transfer funds",
            method="POST", path="/transfer", permission="write",
            constraints=[
                PasoConstraint(max_per_hour=10, description="Limited transfers"),
                PasoConstraint(max_value=5000),
            ],
        )
        desc = _build_tool_description(cap)
        assert "Constraints:" in desc
        assert "Rate limit: 10/hour" in desc
        assert "Max value: 5000" in desc
        assert "Limited transfers" in desc

    def test_plain_description_without_extras(self):
        cap = PasoCapability(
            name="get_item", description="Get an item",
            method="GET", path="/items/{id}", permission="read",
        )
        desc = _build_tool_description(cap)
        assert desc == "Get an item\n\n[Permission: read] [GET /items/{id}]"

    def test_includes_permission_and_method_in_description(self):
        cap = PasoCapability(
            name="update_item", description="Update an item",
            method="PUT", path="/items/{id}", permission="write",
        )
        desc = _build_tool_description(cap)
        assert "[Permission: write]" in desc
        assert "[PUT /items/{id}]" in desc

    def test_includes_requires_field_constraint(self):
        cap = PasoCapability(
            name="transfer", description="Transfer funds",
            method="POST", path="/transfers", permission="admin",
            constraints=[PasoConstraint(requires_field="account_id")],
        )
        desc = _build_tool_description(cap)
        assert "Required: account_id must be provided" in desc


# --- Shared fixture tests for cross-SDK tool-description parity ---
import yaml

TOOL_DESC_FIXTURES = Path(__file__).parent / '..' / '..' / '..' / 'test-fixtures' / 'tool-description'


def _load_tool_desc_fixtures():
    fixtures_dir = TOOL_DESC_FIXTURES.resolve()
    if not fixtures_dir.exists():
        return []
    return sorted(fixtures_dir.glob('*.yaml'))


@pytest.mark.parametrize(
    'fixture_path',
    _load_tool_desc_fixtures(),
    ids=lambda p: p.stem,
)
def test_tool_description_fixture(fixture_path):
    """Shared cross-SDK parity test for tool descriptions."""
    fixture = yaml.safe_load(fixture_path.read_text())
    cap_data = fixture['capability']

    cap = PasoCapability(
        name=cap_data['name'],
        description=cap_data['description'],
        method=cap_data['method'],
        path=cap_data['path'],
        permission=cap_data['permission'],
        consent_required=cap_data.get('consent_required'),
        constraints=[
            PasoConstraint.from_dict(c) for c in cap_data.get('constraints', [])
        ] or None,
    )

    desc = _build_tool_description(cap)

    for substr in fixture.get('expected_contains', []):
        assert substr in desc, f'Expected "{substr}" in description:\n{desc}'
    for substr in fixture.get('expected_not_contains', []):
        assert substr not in desc, f'Did not expect "{substr}" in description:\n{desc}'
