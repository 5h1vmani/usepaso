import json
import os
import re
import httpx
from typing import Any
from mcp.server.fastmcp import FastMCP
from paso.types import PasoDeclaration, PasoCapability


def generate_mcp_server(decl: PasoDeclaration) -> FastMCP:
    """
    Generate a FastMCP server from a Paso declaration.

    Creates a FastMCP server with the service name and registers each capability
    (except those in permissions.forbidden) as a tool that makes HTTP requests
    to the actual API endpoint.

    Args:
        decl: A parsed and validated PasoDeclaration

    Returns:
        A FastMCP server instance with all tools registered
    """
    mcp = FastMCP(decl.service.name)

    # Collect forbidden capability names
    forbidden_names = set()
    if decl.permissions and decl.permissions.forbidden:
        forbidden_names = set(decl.permissions.forbidden)

    # Register each capability as a tool
    for cap in decl.capabilities:
        if cap.name in forbidden_names:
            continue

        # Create a handler for this capability
        handler = _make_handler(cap, decl)

        # Build tool description
        description = cap.description
        if cap.consent_required:
            description += " [REQUIRES CONSENT]"
        if cap.constraints:
            constraint_info = []
            for constraint in cap.constraints:
                if constraint.description:
                    constraint_info.append(constraint.description)
                if constraint.max_per_hour:
                    constraint_info.append(f"max {constraint.max_per_hour}/hour")
                if constraint.max_per_request:
                    constraint_info.append(f"max {constraint.max_per_request}/request")
                if constraint.max_value:
                    constraint_info.append(f"max value {constraint.max_value}")
                if constraint.allowed_values:
                    constraint_info.append(f"allowed: {constraint.allowed_values}")
            if constraint_info:
                description += " [" + "; ".join(constraint_info) + "]"

        # Register the tool
        mcp.tool(name=cap.name, description=description)(handler)

    return mcp


def _make_handler(cap: PasoCapability, decl: PasoDeclaration):
    """
    Create a handler function for a capability.

    Returns an async function that accepts **kwargs (tool inputs),
    builds the HTTP request, makes it, and returns the response.
    """
    async def handler(**kwargs) -> str:
        # Separate inputs by their 'in' location
        path_params = {}
        query_params = {}
        body_data = {}
        headers = {}

        if cap.inputs:
            for param_name, param_spec in cap.inputs.items():
                if param_name not in kwargs:
                    if param_spec.required:
                        return f"Error: required parameter '{param_name}' not provided"
                    continue

                value = kwargs[param_name]

                # Determine where this parameter goes
                param_in = param_spec.in_ if param_spec.in_ else _default_param_location(cap.method)

                if param_in == 'path':
                    path_params[param_name] = value
                elif param_in == 'query':
                    query_params[param_name] = value
                elif param_in == 'header':
                    headers[param_name] = value
                elif param_in == 'body':
                    body_data[param_name] = value

        # Build URL
        url = decl.service.base_url + cap.path

        # Substitute path parameters
        for param_name, value in path_params.items():
            url = url.replace(f"{{{param_name}}}", str(value))

        # Add auth header if configured
        if decl.service.auth:
            auth_header = _build_auth_header(decl.service.auth)
            if auth_header:
                headers.update(auth_header)

        # Determine request body
        request_body = None
        if cap.method in ['POST', 'PUT', 'PATCH']:
            if body_data:
                request_body = body_data

        # Make HTTP request
        try:
            async with httpx.AsyncClient() as client:
                response = await client.request(
                    method=cap.method,
                    url=url,
                    params=query_params if query_params else None,
                    json=request_body if request_body else None,
                    headers=headers if headers else None,
                    timeout=30.0
                )

            # Format response
            try:
                response_json = response.json()
                return json.dumps(response_json, indent=2)
            except Exception:
                return response.text

        except Exception as e:
            return f"Error: {str(e)}"

    return handler


def _default_param_location(method: str) -> str:
    """
    Determine the default location for parameters based on HTTP method.

    GET and DELETE use query by default.
    POST, PUT, PATCH use body by default.
    """
    if method in ['GET', 'DELETE']:
        return 'query'
    else:
        return 'body'


def _build_auth_header(auth) -> dict:
    """
    Build authorization header from auth config.

    Supports bearer and api_key types.
    Token read from USEPASO_AUTH_TOKEN environment variable.
    """
    token = os.environ.get('USEPASO_AUTH_TOKEN')
    if not token:
        return {}

    if auth.type == 'bearer':
        header_name = auth.header or 'Authorization'
        prefix = auth.prefix or 'Bearer'
        return {header_name: f"{prefix} {token}"}
    elif auth.type == 'api_key':
        header_name = auth.header or 'X-API-Key'
        return {header_name: token}

    return {}


def serve_mcp(decl: PasoDeclaration) -> None:
    """
    Generate an MCP server from a Paso declaration and serve it on stdio.

    Args:
        decl: A parsed and validated PasoDeclaration
    """
    mcp = generate_mcp_server(decl)
    mcp.run(transport="stdio")
