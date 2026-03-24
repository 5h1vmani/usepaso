"""
Shared HTTP execution module used by both the MCP server and the test CLI command.
"""

import asyncio
import json
import os
import time
from typing import Any, Optional
from urllib.parse import quote, urlencode

import httpx

from paso.types import PasoCapability, PasoDeclaration


def build_request(cap: PasoCapability, args: dict, decl: PasoDeclaration,
                   auth_token: Optional[str] = None) -> dict:
    """
    Build an HTTP request dict from a capability, arguments, and declaration.
    Note: does not validate required inputs — callers (CLI, MCP) must validate before calling.

    Args:
        cap: PasoCapability with method, path, inputs, etc.
        args: Dictionary of argument values
        decl: PasoDeclaration with service config and auth details
        auth_token: Auth token. Falls back to USEPASO_AUTH_TOKEN env var if not provided.

    Returns:
        Dict with keys: method, url, headers, body (optional)
    """
    method = cap.method.upper()
    path = cap.path

    # Substitute path parameters
    path_params = {}
    query_params = {}
    body_params = {}
    header_params = {}

    if cap.inputs:
        for param_name, input_spec in cap.inputs.items():
            if param_name not in args:
                continue

            param_value = args[param_name]
            in_type = getattr(input_spec, "in_", None)

            # Determine location if not explicitly set
            if in_type is None:
                if method in ("GET", "DELETE"):
                    in_type = "query"
                elif method in ("POST", "PUT", "PATCH"):
                    in_type = "body"

            if in_type == "path":
                path_params[param_name] = param_value
            elif in_type == "query":
                query_params[param_name] = param_value
            elif in_type == "body":
                body_params[param_name] = param_value
            elif in_type == "header":
                header_params[param_name] = param_value
            else:
                raise ValueError(
                    f'Unknown input location "{in_type}" for parameter "{param_name}". '
                    f'Expected one of: path, query, body, header.'
                )

    # Substitute path parameters into path
    for param_name, param_value in path_params.items():
        path = path.replace(f"{{{param_name}}}", quote(str(param_value), safe=''))

    # Build URL
    base_url = decl.service.base_url.rstrip("/")
    path = path.lstrip("/")
    url = f"{base_url}/{path}"

    # Append query parameters
    if query_params:
        query_string = urlencode(query_params, quote_via=quote)
        url = f"{url}?{query_string}"

    # Build headers
    has_body = method in ("POST", "PUT", "PATCH")
    headers = {"Accept": "application/json"}
    if has_body:
        headers["Content-Type"] = "application/json"

    # Add authentication header
    token = auth_token if auth_token is not None else os.environ.get("USEPASO_AUTH_TOKEN")
    if decl.service.auth:
        if decl.service.auth.type == "none":
            pass  # Skip auth — notice is logged once at command startup, not per-request
        elif token:
            auth = decl.service.auth
            header_name = auth.header or "Authorization"
            if auth.type in ("bearer", "oauth2"):
                prefix = auth.prefix if auth.prefix is not None else "Bearer"
                headers[header_name] = f"{prefix} {token}" if prefix else token
            elif auth.type == "api_key":
                headers[header_name] = token
            else:
                import sys
                print(
                    f'Warning: unknown auth.type "{auth.type}" — sending token as-is in {header_name}',
                    file=sys.stderr,
                )
                headers[header_name] = token

    # Add header parameters (strip newlines to prevent header injection)
    for k, v in header_params.items():
        headers[k] = str(v).replace('\r', '').replace('\n', '')

    # Build request dict
    req = {
        "method": method,
        "url": url,
        "headers": headers,
    }

    # Add body if needed
    if method in ("POST", "PUT", "PATCH") and body_params:
        req["body"] = json.dumps(body_params)

    return req


async def execute_request(req: dict, client: Optional[httpx.AsyncClient] = None,
                          timeout: float = 30.0) -> dict:
    """
    Execute an HTTP request asynchronously.

    Args:
        req: Request dict from build_request with method, url, headers, and optional body
        client: Optional reusable httpx.AsyncClient for connection pooling (e.g. in serve mode).
                If not provided, a new client is created per request.
        timeout: Request timeout in seconds (default 30). Ignored if client is provided
                 (client's own timeout applies).

    Returns:
        Dict with: request, status, status_text, body, duration_ms, error
    """
    start_time = time.time()
    result = {
        "request": req,
        "status": None,
        "status_text": "",
        "body": "",
        "duration_ms": 0,
        "error": None,
    }

    async def _do_request(c: httpx.AsyncClient) -> None:
        max_size = 10 * 1024 * 1024  # 10MB

        # Check content-length first (fast path)
        response = await c.request(
            method=req["method"],
            url=req["url"],
            headers=req["headers"],
            content=req.get("body"),
        )

        content_length = response.headers.get("content-length")
        if content_length and int(content_length) > max_size:
            raise ValueError(f"Response too large ({content_length} bytes, max {max_size})")

        result["status"] = response.status_code
        result["status_text"] = response.reason_phrase or ""

        # Read body and check actual size (catches chunked responses too)
        raw_text = response.text
        if len(raw_text.encode("utf-8")) > max_size:
            raise ValueError(
                f"Response too large (>{max_size} bytes received, max {max_size})"
            )

        # Try to pretty-print JSON responses
        try:
            body_json = json.loads(raw_text)
            result["body"] = json.dumps(body_json, indent=2)
        except (json.JSONDecodeError, ValueError):
            result["body"] = raw_text

    try:
        if client:
            await _do_request(client)
        else:
            async with httpx.AsyncClient(timeout=timeout) as new_client:
                await _do_request(new_client)

    except httpx.RequestError as e:
        result["error"] = str(e)
    except Exception as e:
        result["error"] = str(e)

    end_time = time.time()
    result["duration_ms"] = int((end_time - start_time) * 1000)

    return result


def format_error(result: dict, decl: PasoDeclaration,
                 auth_token: Optional[str] = None) -> str:
    """
    Format a friendly error message from a request result.
    Messages match the JS SDK output verbatim for parity.

    Args:
        result: Result dict from execute_request
        decl: PasoDeclaration with service config
        auth_token: Auth token. Falls back to USEPASO_AUTH_TOKEN env var if not provided.

    Returns:
        Formatted error message string
    """
    token = auth_token if auth_token is not None else os.environ.get("USEPASO_AUTH_TOKEN")

    # Handle connection errors
    if result["error"]:
        return f"Request failed: {result['error']}"

    status = result["status"]

    if not status:
        return "Unknown error"

    if status == 401:
        auth_type = decl.service.auth.type if decl.service.auth else "unknown"
        has_token = bool(token)
        msg = "Error 401: Authentication failed."
        if not has_token:
            msg += "\n  \u2192 USEPASO_AUTH_TOKEN is not set. Set it with: export USEPASO_AUTH_TOKEN=your-token"
        else:
            msg += "\n  \u2192 USEPASO_AUTH_TOKEN is set but was rejected by the API."
            msg += f"\n  \u2192 Auth type: {auth_type}. Check that your token is valid and has the required scopes."
        return msg

    if status == 403:
        return "Error 403: Forbidden. Your token does not have permission for this action.\n  \u2192 Check the required scopes/permissions for this endpoint."

    if status == 404:
        url = result["request"]["url"]
        return f"Error 404: Not found.\n  \u2192 Check that base_url and path are correct in your usepaso.yaml.\n  \u2192 URL was: {url}"

    if status == 429:
        return "Error 429: Rate limited. The API is throttling requests.\n  \u2192 Wait and try again, or check your rate limit constraints."

    if status >= 500:
        return f"Error {status}: Server error from the API.\n  \u2192 This is likely a problem on the API side, not with usepaso."

    return f"Error {status} {result.get('status_text', '')}: {result.get('body', '')}"
