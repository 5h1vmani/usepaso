import asyncio
from typing import Callable, Optional

from mcp.server.fastmcp import FastMCP

from paso.types import PasoDeclaration, PasoCapability
from paso.executor import build_request, execute_request, format_error


LogCallback = Optional[Callable[[str, dict, PasoDeclaration], None]]


def _build_tool_description(cap: PasoCapability) -> str:
    """Build a rich tool description matching the JS SDK format."""
    desc = cap.description

    if cap.consent_required:
        desc += '\n\n⚠️ REQUIRES USER CONSENT: You must confirm this action with the user before executing.'

    if cap.constraints:
        desc += '\n\nConstraints:'
        for c in cap.constraints:
            if c.description:
                desc += f'\n- {c.description}'
            if c.max_per_hour:
                desc += f'\n- Rate limit: {c.max_per_hour}/hour'
            if c.max_value:
                desc += f'\n- Max value: {c.max_value}'
            if c.max_per_request:
                desc += f'\n- Max per request: {c.max_per_request}'

    return desc


def generate_mcp_server(decl: PasoDeclaration, on_log: LogCallback = None) -> FastMCP:
    """
    Generate a FastMCP server from a Paso declaration.
    Uses the shared executor for HTTP requests.
    """
    mcp = FastMCP(decl.service.name)

    forbidden_names = set()
    if decl.permissions and decl.permissions.forbidden:
        forbidden_names = set(decl.permissions.forbidden)

    for cap in decl.capabilities:
        if cap.name in forbidden_names:
            continue

        description = _build_tool_description(cap)

        def _make_handler(cap_ref: PasoCapability):
            async def handler(**kwargs) -> str:
                req = build_request(cap_ref, kwargs, decl)
                result = await execute_request(req)

                if on_log:
                    on_log(cap_ref.name, result, decl)

                if result.get('error') or (result.get('status') and result['status'] >= 400):
                    return format_error(result, decl)

                return result['body']
            return handler

        handler = _make_handler(cap)
        mcp.tool(name=cap.name, description=description)(handler)

    return mcp


def serve_mcp(decl: PasoDeclaration, on_log: LogCallback = None) -> None:
    """Generate an MCP server and serve it on stdio."""
    mcp = generate_mcp_server(decl, on_log)
    mcp.run(transport="stdio")
