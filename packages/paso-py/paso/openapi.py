"""
OpenAPI 3.x to usepaso.yaml generator.
Translates an OpenAPI specification into a Paso declarative format.
"""

import re
import yaml

MAX_CAPABILITIES = 20
HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head']


def to_snake_case(s: str) -> str:
    s = re.sub(r'[^a-zA-Z0-9]', '_', s)
    s = re.sub(r'([A-Z])', r'_\1', s)
    s = s.lower()
    s = re.sub(r'_+', '_', s)
    return s.strip('_')


def derive_name(method: str, path: str, operation_id: str = None) -> str:
    if operation_id:
        candidate = to_snake_case(operation_id)
        if re.match(r'^[a-z]', candidate):
            return candidate
        return re.sub(r'^_|_$', '', f'{method.lower()}_{candidate}')

    # Build from method + path segments (include path params like JS does)
    segments = []
    for seg in path.split('/'):
        if not seg:
            continue
        if seg.startswith('{') and seg.endswith('}'):
            segments.append(seg[1:-1])
        else:
            segments.append(seg)

    parts = [method.lower()] + segments
    return to_snake_case('_'.join(parts))


def detect_auth(spec: dict):
    components = spec.get('components', {})
    security_schemes = components.get('securitySchemes', {})

    for scheme_def in security_schemes.values():
        scheme_type = (scheme_def.get('type') or '').lower()
        scheme_value = (scheme_def.get('scheme') or '').lower()

        if scheme_type == 'http' and scheme_value in ('bearer', 'jwt'):
            return {'type': 'bearer'}
        if scheme_type == 'apikey':
            auth = {'type': 'api_key'}
            if scheme_def.get('in') == 'header' and scheme_def.get('name'):
                auth['header'] = scheme_def['name']
            return auth
        if scheme_type == 'oauth2':
            return {'type': 'oauth2'}

    # Check global security hints
    for sec_req in spec.get('security', []) or []:
        for key in (sec_req or {}).keys():
            kl = key.lower()
            if 'bearer' in kl or 'jwt' in kl:
                return {'type': 'bearer'}
            if 'apikey' in kl or 'api_key' in kl:
                return {'type': 'api_key'}
            if 'oauth' in kl:
                return {'type': 'oauth2'}

    return None


def map_schema_type(schema: dict) -> str:
    if not schema:
        return 'string'
    if 'enum' in schema:
        return 'enum'
    return {
        'integer': 'integer', 'number': 'number', 'boolean': 'boolean',
        'array': 'array', 'object': 'object', 'string': 'string',
    }.get(schema.get('type', ''), 'string')


def map_output_type(schema: dict) -> str:
    if not schema:
        return 'string'
    return {
        'integer': 'integer', 'number': 'number', 'boolean': 'boolean',
        'array': 'array', 'object': 'object', 'string': 'string',
    }.get(schema.get('type', ''), 'string')


def map_param_in(location: str):
    return {'query': 'query', 'path': 'path', 'header': 'header'}.get(location)


def derive_permission(method: str) -> str:
    m = method.upper()
    if m in ('GET', 'HEAD'):
        return 'read'
    if m == 'DELETE':
        return 'admin'
    return 'write'


def requires_consent(method: str) -> bool:
    return method.upper() in ('DELETE', 'PUT', 'PATCH')


def resolve_refs(obj, root):
    """Resolve all $ref pointers in an OpenAPI spec recursively."""
    if obj is None or not isinstance(obj, (dict, list)):
        return obj

    if isinstance(obj, list):
        return [resolve_refs(item, root) for item in obj]

    if '$ref' in obj and isinstance(obj['$ref'], str):
        ref = obj['$ref']
        if ref.startswith('#/'):
            path_parts = ref[2:].split('/')
            target = root
            for part in path_parts:
                if isinstance(target, dict):
                    target = target.get(part)
                else:
                    return obj
            # Merge sibling properties
            siblings = {k: v for k, v in obj.items() if k != '$ref'}
            if siblings and isinstance(target, dict):
                merged = {**target, **siblings}
                return resolve_refs(merged, root)
            return resolve_refs(target, root)
        return obj

    return {k: resolve_refs(v, root) for k, v in obj.items()}


def build_inputs(operation: dict, path_str: str):
    inputs = {}

    for param in operation.get('parameters', []):
        name = param.get('name')
        param_in = param.get('in')
        if not name or not param_in:
            continue
        if param.get('deprecated'):
            continue
        location = map_param_in(param_in)
        if not location:
            continue

        schema = param.get('schema', {})
        input_type = map_schema_type(schema)
        entry = {
            'type': input_type,
            'required': param.get('required', param_in == 'path'),
            'description': param.get('description') or name,
            'in': location,
        }
        if input_type == 'enum' and 'enum' in schema:
            entry['values'] = schema['enum']
        if 'default' in schema:
            entry['default'] = schema['default']
        inputs[name] = entry

    # requestBody
    request_body = operation.get('requestBody', {}) or {}
    json_content = request_body.get('content', {}).get('application/json', {})
    schema = json_content.get('schema', {})
    if schema and 'properties' in schema:
        required_fields = set(schema.get('required', []))
        for prop_name, prop_schema in schema['properties'].items():
            if prop_name in inputs:
                continue
            input_type = map_schema_type(prop_schema)
            entry = {
                'type': input_type,
                'required': prop_name in required_fields,
                'description': prop_schema.get('description') or prop_name,
                'in': 'body',
            }
            if input_type == 'enum' and 'enum' in prop_schema:
                entry['values'] = prop_schema['enum']
            if 'default' in prop_schema:
                entry['default'] = prop_schema['default']
            inputs[prop_name] = entry

    # Auto-inject path params
    for match in re.findall(r'\{([^}]+)\}', path_str):
        if match not in inputs:
            inputs[match] = {
                'type': 'string',
                'required': True,
                'description': match,
                'in': 'path',
            }
        elif 'in' not in inputs[match]:
            inputs[match]['in'] = 'path'

    return inputs if inputs else None


def build_output(operation: dict):
    responses = operation.get('responses', {})
    response = responses.get('200') or responses.get('201')
    if not response:
        return None

    json_content = (response.get('content') or {}).get('application/json', {})
    schema = json_content.get('schema', {})
    if not schema or 'properties' not in schema:
        return None

    output = {}
    for name, prop in schema['properties'].items():
        output[name] = {
            'type': map_output_type(prop),
            'description': prop.get('description') or name,
        }
    return output if output else None


def generate_from_openapi(openapi_spec: dict) -> dict:
    """
    Generate a usepaso.yaml from an OpenAPI 3.x spec.

    Returns a dict with:
      yaml: str - the YAML content
      service_name: str
      auth_type: str
      total_operations: int
      generated_count: int
      read_count: int
      write_count: int
      admin_count: int
    """
    # Resolve $ref pointers
    spec = resolve_refs(openapi_spec, openapi_spec)

    info = spec.get('info', {})
    servers = spec.get('servers', [])
    base_url = 'https://api.example.com'
    if servers:
        server_url = servers[0].get('url', '')
        if server_url.startswith('/'):
            base_url = f'https://api.example.com{server_url}'
        elif server_url:
            base_url = server_url

    auth = detect_auth(spec)
    auth_type = auth['type'] if auth else 'none'

    service = {
        'name': info.get('title') or 'Unnamed Service',
        'description': info.get('description') or info.get('title') or 'No description provided',
        'base_url': base_url,
    }
    if auth:
        service['auth'] = auth

    # Count total operations
    paths = spec.get('paths', {})
    total_operations = 0
    for path_item in paths.values():
        if not path_item:
            continue
        for method in HTTP_METHODS:
            op = path_item.get(method)
            if op and not op.get('deprecated'):
                total_operations += 1

    # Build capabilities
    capabilities = []
    seen_names = set()

    for path_str, path_item in paths.items():
        if not path_item:
            continue
        if len(capabilities) >= MAX_CAPABILITIES:
            break

        for method in HTTP_METHODS:
            if len(capabilities) >= MAX_CAPABILITIES:
                break

            operation = path_item.get(method)
            if not operation or operation.get('deprecated'):
                continue

            raw_name = derive_name(method, path_str, operation.get('operationId'))

            # Deduplicate
            name = raw_name
            counter = 1
            while name in seen_names:
                name = f'{raw_name}_{counter}'
                counter += 1
            seen_names.add(name)

            summary_or_desc = operation.get('summary') or operation.get('description') or ''
            description = summary_or_desc[:200] or f'{method.upper()} {path_str}'

            permission = derive_permission(method)
            consent = requires_consent(method)

            inputs = build_inputs(operation, path_str)
            output = build_output(operation)

            capability = {
                'name': name,
                'description': description,
                'method': method.upper(),
                'path': path_str,
                'permission': permission,
            }
            if consent:
                capability['consent_required'] = True
            if inputs:
                capability['inputs'] = inputs
            if output:
                capability['output'] = output

            capabilities.append(capability)

    # Permissions (omit empty tiers)
    perm_read = [c['name'] for c in capabilities if c['permission'] == 'read']
    perm_write = [c['name'] for c in capabilities if c['permission'] == 'write']
    perm_admin = [c['name'] for c in capabilities if c['permission'] == 'admin']

    permissions = {}
    if perm_read:
        permissions['read'] = perm_read
    if perm_write:
        permissions['write'] = perm_write
    if perm_admin:
        permissions['admin'] = perm_admin

    declaration = {
        'version': '1.0',
        'service': service,
        'capabilities': capabilities,
    }
    if permissions:
        declaration['permissions'] = permissions

    yaml_str = yaml.dump(
        declaration,
        default_flow_style=False,
        sort_keys=False,
        allow_unicode=True,
        width=1000,
    )

    return {
        'yaml': yaml_str,
        'service_name': service['name'],
        'auth_type': auth_type,
        'total_operations': total_operations,
        'generated_count': len(capabilities),
        'read_count': len(perm_read),
        'write_count': len(perm_write),
        'admin_count': len(perm_admin),
    }
