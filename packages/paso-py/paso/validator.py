import re
from urllib.parse import urlparse
from paso.types import PasoDeclaration, PasoCapability, ValidationError


VALID_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
VALID_PERMISSIONS = ['read', 'write', 'admin']
VALID_INPUT_TYPES = ['string', 'integer', 'number', 'boolean', 'enum', 'array', 'object']
VALID_OUTPUT_TYPES = ['string', 'integer', 'number', 'boolean', 'object', 'array']
VALID_AUTH_TYPES = ['api_key', 'bearer', 'oauth2', 'none']
VALID_IN_VALUES = ['query', 'path', 'body', 'header']
SNAKE_CASE_RE = re.compile(r'^[a-z][a-z0-9_]*$')


def validate(decl: PasoDeclaration) -> list[ValidationError]:
    """
    Validate a parsed PasoDeclaration against the spec.
    Returns a list of errors. Empty list = valid.
    """
    errors: list[ValidationError] = []

    # Version
    if not decl.version:
        errors.append(ValidationError(path='version', message='version is required'))
    elif decl.version != '1.0':
        errors.append(ValidationError(path='version', message='version must be "1.0"'))

    # Service
    if not decl.service:
        errors.append(ValidationError(path='service', message='service is required'))
    else:
        if not decl.service.name:
            errors.append(ValidationError(path='service.name', message='service.name is required'))
        if not decl.service.description:
            errors.append(ValidationError(path='service.description', message='service.description is required'))
        if not decl.service.base_url:
            errors.append(ValidationError(path='service.base_url', message='service.base_url is required'))
        else:
            if not _is_valid_url(decl.service.base_url):
                errors.append(ValidationError(path='service.base_url', message='service.base_url must be a valid URL'))

        if decl.service.auth:
            if decl.service.auth.type not in VALID_AUTH_TYPES:
                errors.append(ValidationError(
                    path='service.auth.type',
                    message=f'auth.type must be one of: {", ".join(VALID_AUTH_TYPES)}'
                ))

    # Capabilities
    if decl.capabilities is None:
        errors.append(ValidationError(path='capabilities', message='capabilities is required'))
    elif not isinstance(decl.capabilities, list):
        errors.append(ValidationError(path='capabilities', message='capabilities must be an array'))
    else:
        names: set[str] = set()
        for i, cap in enumerate(decl.capabilities):
            prefix = f'capabilities[{i}]'
            errors.extend(_validate_capability(cap, prefix, names))

    # Permissions
    if decl.permissions:
        cap_names = set(cap.name for cap in (decl.capabilities or []))
        all_referenced: set[str] = set()

        for tier in ['read', 'write', 'admin', 'forbidden']:
            tier_list = getattr(decl.permissions, tier, None)
            if tier_list:
                for name in tier_list:
                    # forbidden can reference capabilities not declared
                    if tier != 'forbidden' and name not in cap_names:
                        errors.append(ValidationError(
                            path=f'permissions.{tier}',
                            message=f'references unknown capability "{name}"'
                        ))
                    all_referenced.add(name)

        # Check forbidden doesn't overlap with tiers
        if decl.permissions.forbidden:
            tiered = set()
            if decl.permissions.read:
                tiered.update(decl.permissions.read)
            if decl.permissions.write:
                tiered.update(decl.permissions.write)
            if decl.permissions.admin:
                tiered.update(decl.permissions.admin)

            for name in decl.permissions.forbidden:
                if name in tiered:
                    errors.append(ValidationError(
                        path='permissions.forbidden',
                        message=f'"{name}" cannot be both in a permission tier and forbidden'
                    ))

    return errors


def _validate_capability(cap: PasoCapability, prefix: str, names: set[str]) -> list[ValidationError]:
    """
    Validate a single capability.
    """
    errors: list[ValidationError] = []

    if not cap.name:
        errors.append(ValidationError(path=f'{prefix}.name', message='name is required'))
    else:
        if not SNAKE_CASE_RE.match(cap.name):
            errors.append(ValidationError(
                path=f'{prefix}.name',
                message=f'"{cap.name}" must be snake_case'
            ))
        if cap.name in names:
            errors.append(ValidationError(
                path=f'{prefix}.name',
                message=f'duplicate capability name "{cap.name}"'
            ))
        names.add(cap.name)

    if not cap.description:
        errors.append(ValidationError(path=f'{prefix}.description', message='description is required'))

    if not cap.method:
        errors.append(ValidationError(path=f'{prefix}.method', message='method is required'))
    elif cap.method not in VALID_METHODS:
        errors.append(ValidationError(
            path=f'{prefix}.method',
            message=f'method must be one of: {", ".join(VALID_METHODS)}'
        ))

    if not cap.path:
        errors.append(ValidationError(path=f'{prefix}.path', message='path is required'))
    elif not cap.path.startswith('/'):
        errors.append(ValidationError(path=f'{prefix}.path', message='path must start with /'))

    if not cap.permission:
        errors.append(ValidationError(path=f'{prefix}.permission', message='permission is required'))
    elif cap.permission not in VALID_PERMISSIONS:
        errors.append(ValidationError(
            path=f'{prefix}.permission',
            message=f'permission must be one of: {", ".join(VALID_PERMISSIONS)}'
        ))

    # Validate inputs
    if cap.inputs:
        for input_name, input_obj in cap.inputs.items():
            input_prefix = f'{prefix}.inputs.{input_name}'
            if not input_obj.type:
                errors.append(ValidationError(path=input_prefix, message='type is required'))
            elif input_obj.type not in VALID_INPUT_TYPES:
                errors.append(ValidationError(
                    path=input_prefix,
                    message=f'type must be one of: {", ".join(VALID_INPUT_TYPES)}'
                ))

            if input_obj.type == 'enum' and (not input_obj.values or len(input_obj.values) == 0):
                errors.append(ValidationError(
                    path=input_prefix,
                    message='enum type must have values defined'
                ))

            if not input_obj.description:
                errors.append(ValidationError(path=input_prefix, message='description is required'))

            if input_obj.in_ and input_obj.in_ not in VALID_IN_VALUES:
                errors.append(ValidationError(
                    path=f'{input_prefix}.in',
                    message=f'in must be one of: {", ".join(VALID_IN_VALUES)}'
                ))

    # Validate path params exist in inputs
    if cap.path:
        path_params = re.findall(r'\{([^}]+)\}', cap.path)
        for param in path_params:
            if not cap.inputs or param not in cap.inputs:
                errors.append(ValidationError(
                    path=f'{prefix}.path',
                    message=f'path parameter "{{{param}}}" not found in inputs'
                ))
            elif cap.inputs and cap.inputs[param].in_ and cap.inputs[param].in_ != 'path':
                errors.append(ValidationError(
                    path=f'{prefix}.inputs.{param}',
                    message='path parameter must have in: path'
                ))

    # Validate output
    if cap.output:
        for field_name, output_obj in cap.output.items():
            if not output_obj.type:
                errors.append(ValidationError(
                    path=f'{prefix}.output.{field_name}',
                    message='type is required'
                ))
            elif output_obj.type not in VALID_OUTPUT_TYPES:
                errors.append(ValidationError(
                    path=f'{prefix}.output.{field_name}',
                    message=f'type must be one of: {", ".join(VALID_OUTPUT_TYPES)}'
                ))

    return errors


def _is_valid_url(url: str) -> bool:
    """
    Check if a string is a valid URL.
    """
    try:
        result = urlparse(url)
        return all([result.scheme, result.netloc])
    except Exception:
        return False
