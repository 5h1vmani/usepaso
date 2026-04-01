import yaml
from usepaso.types import PasoDeclaration


def parse_file(file_path: str) -> PasoDeclaration:
    """
    Parse a usepaso.yaml file from disk and return the declaration object.
    Does NOT validate — call validate() separately.
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    return parse_string(content)


def parse_string(content: str) -> PasoDeclaration:
    """
    Parse a YAML string into a PasoDeclaration.
    """
    parsed = yaml.safe_load(content)
    if not parsed or not isinstance(parsed, dict):
        raise ValueError('Invalid YAML: expected an object')

    # Structural guards before cast
    if not isinstance(parsed.get('service'), dict):
        raise ValueError('Invalid declaration: "service" must be an object')
    if 'capabilities' in parsed and not isinstance(parsed['capabilities'], list):
        raise ValueError('Invalid declaration: "capabilities" must be an array')
    if isinstance(parsed.get('service'), dict):
        auth = parsed['service'].get('auth')
        if auth is not None and (not isinstance(auth, dict) or isinstance(auth, list)):
            raise ValueError('Invalid declaration: "service.auth" must be an object (e.g. { type: "bearer" })')
    if 'permissions' in parsed and (not isinstance(parsed['permissions'], dict) or isinstance(parsed['permissions'], list)):
        raise ValueError('Invalid declaration: "permissions" must be an object')

    return PasoDeclaration.from_dict(parsed)
