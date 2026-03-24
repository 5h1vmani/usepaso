"""Tests for the Python MCP generator — mirrors paso-js/tests/mcp.test.ts."""
import os
from pathlib import Path

import pytest

from paso.generators.mcp import generate_mcp_server, _build_tool_description
from paso.parser import parse_file
from paso.types import (
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
        assert desc == "Get an item"
