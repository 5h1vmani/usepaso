import asyncio
import json as _json
import math
import os
import secrets
import sys
import time
from typing import Callable, Optional, Any

import httpx
import mcp.types as mcp_types
import mcp.server.stdio
from mcp.server.lowlevel import Server

from dataclasses import dataclass, field

from usepaso.types import PasoDeclaration, PasoCapability, PasoInput
from usepaso.executor import build_request, execute_request, format_structured_error


LogCallback = Optional[Callable[[str, dict], None]]


@dataclass
class ServeOptions:
    on_log: LogCallback = None
    strict: bool = False


@dataclass
class McpServerResult:
    server: Any
    tool_names: list[str] = field(default_factory=list)


# --- Constraint enforcement (always on) ---

_rate_limit_counters: dict[str, list[float]] = {}


def _check_constraints(cap: PasoCapability, args: dict[str, Any]) -> Optional[str]:
    """Check constraints. Returns error message or None if OK."""
    if not cap.constraints:
        return None

    now = time.time()
    window_s = 3600  # 1 hour

    # Pass 1: validate all constraints (no side effects)
    for constraint in cap.constraints:
        if constraint.max_per_hour:
            timestamps = _rate_limit_counters.get(cap.name, [])
            recent = [t for t in timestamps if now - t < window_s]
            if len(recent) >= constraint.max_per_hour:
                retry_after = math.ceil(recent[0] + window_s - now)
                return f'Rate limit exceeded for "{cap.name}": max {constraint.max_per_hour} calls per hour. Retry after {retry_after} seconds.'

        if constraint.max_value is not None:
            for name, value in args.items():
                if isinstance(value, (int, float)) and value > constraint.max_value:
                    return f'Constraint violated for "{cap.name}": input "{name}" value {value} exceeds maximum of {constraint.max_value}.'

        if constraint.max_per_request is not None:
            for name, value in args.items():
                if isinstance(value, list) and len(value) > constraint.max_per_request:
                    return f'Constraint violated for "{cap.name}": input "{name}" has {len(value)} items, max is {constraint.max_per_request}.'

    # Pass 2: all constraints passed, record rate limit timestamp
    for constraint in cap.constraints:
        if constraint.max_per_hour:
            if cap.name not in _rate_limit_counters:
                _rate_limit_counters[cap.name] = []
            _rate_limit_counters[cap.name] = [t for t in _rate_limit_counters[cap.name] if now - t < window_s]
            _rate_limit_counters[cap.name].append(now)
            break

    return None


# --- Consent enforcement ---

_CONSENT_TOKEN_TTL_S = 300
_pending_consents: dict[str, dict[str, Any]] = {}


def _format_consent_args(args: dict[str, Any]) -> str:
    parts = [f'{k}={_json.dumps(v)}' for k, v in args.items() if k != '__confirm']
    return f'({", ".join(parts)})' if parts else '()'


def _hash_args(args: dict[str, Any]) -> str:
    clean = sorted([(k, v) for k, v in args.items() if k != '__confirm'])
    return _json.dumps(clean)


def _handle_consent(
    cap: PasoCapability, args: dict[str, Any], strict: bool
) -> dict[str, Any]:
    """Returns {'execute': bool, 'log_message'?: str, 'response'?: str}."""
    if not cap.consent_required:
        return {'execute': True}

    args_display = _format_consent_args(args)

    # Advisory mode: return log message, execute
    if not strict:
        return {'execute': True, 'log_message': f'[CONSENT] {cap.name}{args_display} executed'}

    # Strict mode: two-phase confirmation
    confirm_token = args.get('__confirm')
    pending = _pending_consents.get(cap.name)

    if confirm_token and pending:
        if time.time() > pending['expires']:
            del _pending_consents[cap.name]
            return {
                'execute': False,
                'response': f'Confirmation token for "{cap.name}" has expired. Call this tool again without __confirm to get a new token.',
            }
        if confirm_token == pending['token'] and _hash_args(args) == pending['args_hash']:
            del _pending_consents[cap.name]
            return {'execute': True, 'log_message': f'[CONSENT] {cap.name}{args_display} confirmed and executed'}
        del _pending_consents[cap.name]
        return {
            'execute': False,
            'response': f'Invalid confirmation: token or arguments do not match the original request. Call "{cap.name}" again without __confirm to get a new token.',
        }

    # First call: issue a consent challenge bound to these specific args
    token = secrets.token_hex(16)
    _pending_consents[cap.name] = {
        'token': token,
        'args_hash': _hash_args(args),
        'expires': time.time() + _CONSENT_TOKEN_TTL_S,
    }

    challenge = '\n'.join([
        'This action requires confirmation.',
        '',
        f'Action: {cap.name}{args_display}',
        f'Description: {cap.description}',
        f'Method: {cap.method} {cap.path}',
        '',
        f'To proceed, call this tool again with the same arguments and __confirm: "{token}"',
        'This token expires in 5 minutes.',
    ])
    return {'execute': False, 'response': challenge}


def _build_tool_description(cap: PasoCapability) -> str:
    """Build a rich tool description matching the JS SDK format."""
    desc = cap.description

    desc += f'\n\n[Permission: {cap.permission}] [{cap.method} {cap.path}]'

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
            if c.requires_field:
                desc += f'\n- Required: {c.requires_field} must be provided'

    return desc


def _input_to_json_schema(input_def: PasoInput) -> dict[str, Any]:
    """Convert a PasoInput to a JSON Schema property definition. Mirrors JS inputToZod."""
    schema: dict[str, Any] = {}
    match input_def.type:
        case 'string':
            schema['type'] = 'string'
        case 'integer':
            schema['type'] = 'integer'
        case 'number':
            schema['type'] = 'number'
        case 'boolean':
            schema['type'] = 'boolean'
        case 'enum':
            if input_def.values and len(input_def.values) > 0:
                all_strings = all(isinstance(v, str) for v in input_def.values)
                if all_strings:
                    schema['type'] = 'string'
                    schema['enum'] = input_def.values
                else:
                    schema['enum'] = input_def.values
            else:
                schema['type'] = 'string'
        case 'array':
            schema['type'] = 'array'
        case 'object':
            schema['type'] = 'object'
        case _:
            schema = {}
    if input_def.description:
        schema['description'] = input_def.description
    if input_def.default is not None:
        schema['default'] = input_def.default
    return schema


def build_json_schema(cap: PasoCapability, strict: bool = False) -> Optional[dict[str, Any]]:
    """Build a JSON Schema inputSchema from a capability's inputs. Mirrors JS buildZodSchema."""
    has_inputs = cap.inputs and len(cap.inputs) > 0
    needs_confirm = strict and cap.consent_required

    if not has_inputs and not needs_confirm:
        return None

    properties: dict[str, Any] = {}
    required: list[str] = []

    if cap.inputs:
        for name, input_def in cap.inputs.items():
            properties[name] = _input_to_json_schema(input_def)
            if input_def.required:
                required.append(name)

    if needs_confirm:
        properties['__confirm'] = {
            'type': 'string',
            'description': 'Confirmation token (provided by the server after first call)',
        }

    schema: dict[str, Any] = {
        'type': 'object',
        'properties': properties,
    }
    if required:
        schema['required'] = required

    return schema


def generate_mcp_server(decl: PasoDeclaration, options: Optional[ServeOptions] = None) -> McpServerResult:
    """
    Generate a low-level MCP Server from a Paso declaration.
    Each capability becomes an MCP tool with an explicit JSON Schema.
    """
    resolved = options or ServeOptions()
    resolved_on_log = resolved.on_log
    strict = resolved.strict

    server = Server(
        name=decl.service.name,
        version=decl.service.version or '1.0.0',
    )
    shared_client = httpx.AsyncClient(timeout=30.0)

    forbidden_names = set()
    if decl.permissions and decl.permissions.forbidden:
        forbidden_names = set(decl.permissions.forbidden)

    # Clear state for fresh server
    _rate_limit_counters.clear()
    _pending_consents.clear()

    # Build tool definitions and handler lookup
    tools: list[mcp_types.Tool] = []
    tool_names: list[str] = []
    handlers: dict[str, PasoCapability] = {}

    for cap in decl.capabilities:
        if cap.name in forbidden_names:
            continue

        description = _build_tool_description(cap)
        input_schema = build_json_schema(cap, strict)

        tools.append(mcp_types.Tool(
            name=cap.name,
            description=description,
            inputSchema=input_schema or {'type': 'object', 'properties': {}},
        ))
        tool_names.append(cap.name)
        handlers[cap.name] = cap

    @server.list_tools()
    async def handle_list_tools() -> list[mcp_types.Tool]:
        return tools

    @server.call_tool()
    async def handle_call_tool(name: str, arguments: dict | None) -> list[mcp_types.TextContent]:
        cap = handlers.get(name)
        if not cap:
            return [mcp_types.TextContent(type='text', text=f'Unknown tool: "{name}"')]

        args = dict(arguments or {})

        # 1. Check constraints (always enforced)
        constraint_error = _check_constraints(cap, args)
        if constraint_error:
            return [mcp_types.TextContent(type='text', text=constraint_error)]

        # 2. Check consent (advisory or strict)
        consent = _handle_consent(cap, args, strict)
        if not consent['execute']:
            return [mcp_types.TextContent(type='text', text=consent['response'])]
        if consent.get('log_message'):
            print(consent['log_message'], file=sys.stderr)

        # 3. Execute the request
        clean_args = {k: v for k, v in args.items() if k != '__confirm'}

        # Apply defaults for missing optional inputs
        if cap.inputs:
            for inp_name, inp_def in cap.inputs.items():
                if inp_name not in clean_args and inp_def.default is not None:
                    clean_args[inp_name] = inp_def.default

        auth_token = os.environ.get('USEPASO_AUTH_TOKEN')
        req = build_request(cap, clean_args, decl, auth_token=auth_token)
        result = await execute_request(req, client=shared_client)

        if resolved_on_log:
            resolved_on_log(cap.name, result)

        if result.get('error') or (result.get('status') and result['status'] >= 400):
            structured = format_structured_error(result, decl, auth_token=auth_token)
            body = result.get('body', '')
            text = _json.dumps(structured)
            return [mcp_types.TextContent(
                type='text',
                text=f'{text}\n\nResponse body:\n{body}' if body else text,
            )]

        return [mcp_types.TextContent(type='text', text=result['body'])]

    return McpServerResult(server=server, tool_names=tool_names)


def serve_mcp(decl: PasoDeclaration, options: Optional[ServeOptions] = None) -> None:
    """Generate an MCP server and serve it on stdio."""
    result = generate_mcp_server(decl, options=options)
    server = result.server

    async def _run():
        async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
            await server.run(
                read_stream,
                write_stream,
                server.create_initialization_options(),
            )

    asyncio.run(_run())
