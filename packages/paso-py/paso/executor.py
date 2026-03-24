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


def build_request(cap: PasoCapability, args: dict, decl: PasoDeclaration) -> dict:
    """
    Build an HTTP request dict from a capability, arguments, and declaration.

    Args:
        cap: PasoCapability with method, path, inputs, etc.
        args: Dictionary of argument values
        decl: PasoDeclaration with service config and auth details

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
        query_string = urlencode(query_params)
        url = f"{url}?{query_string}"

    # Build headers
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    # Add authentication header
    auth_token = os.environ.get("USEPASO_AUTH_TOKEN")
    if decl.service.auth:
        if decl.service.auth.type == "none":
            pass  # Skip auth — notice is logged once at command startup, not per-request
        elif auth_token:
            auth = decl.service.auth
            header_name = auth.header or "Authorization"
            if auth.type in ("bearer", "oauth2"):
                prefix = auth.prefix if auth.prefix is not None else "Bearer"
                headers[header_name] = f"{prefix} {auth_token}" if prefix else auth_token
            elif auth.type == "api_key":
                headers[header_name] = auth_token
            else:
                import sys
                print(
                    f'Warning: unknown auth.type "{auth.type}" — sending token as-is in {header_name}',
                    file=sys.stderr,
                )
                headers[header_name] = auth_token

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


async def execute_request(req: dict) -> dict:
    """
    Execute an HTTP request asynchronously.

    Args:
        req: Request dict from build_request with method, url, headers, and optional body

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

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                method=req["method"],
                url=req["url"],
                headers=req["headers"],
                content=req.get("body"),
            )

            result["status"] = response.status_code
            result["status_text"] = response.reason_phrase or ""

            # Try to pretty-print JSON responses
            try:
                body_json = response.json()
                result["body"] = json.dumps(body_json, indent=2)
            except (json.JSONDecodeError, ValueError):
                result["body"] = response.text

    except httpx.RequestError as e:
        result["error"] = str(e)
    except Exception as e:
        result["error"] = str(e)

    end_time = time.time()
    result["duration_ms"] = int((end_time - start_time) * 1000)

    return result


def format_error(result: dict, decl: PasoDeclaration) -> str:
    """
    Format a friendly error message from a request result.

    Args:
        result: Result dict from execute_request
        decl: PasoDeclaration with service config

    Returns:
        Formatted error message string
    """
    auth_token = os.environ.get("USEPASO_AUTH_TOKEN")

    # Handle connection errors
    if result["error"]:
        return f"Request failed: {result['error']}"

    status = result["status"]

    if status == 401:
        hint = ""
        if not auth_token:
            hint = "\nHint: USEPASO_AUTH_TOKEN is not set. Please set it and try again."
        else:
            hint = "\nHint: Your USEPASO_AUTH_TOKEN may be invalid or expired."
        return f"Error 401: Authentication failed.{hint}"

    elif status == 403:
        return "Error 403: Forbidden.\nHint: Your token may not have the required scopes for this endpoint."

    elif status == 404:
        url = result["request"]["url"]
        hint = f"\nHint: Check your base_url ({decl.service.base_url}) and path."
        return f"Error 404: Not found.\nURL: {url}{hint}"

    elif status == 429:
        return "Error 429: Rate limited.\nPlease wait before retrying."

    elif status and status >= 500:
        return f"Error {status}: Server error from the API."

    return f"Error {status}: {result['status_text']}"
