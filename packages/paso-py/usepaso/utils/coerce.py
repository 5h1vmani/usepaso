import re

_INTEGER_RE = re.compile(r'^-?\d+$')
_NUMBER_RE = re.compile(r'^-?\d+(\.\d+)?$')


def coerce_value(raw: str, declared_type: str, key: str):
    """Coerce a CLI string value to the declared input type. Raises ValueError on invalid input."""
    if declared_type == 'integer':
        if not _INTEGER_RE.match(raw):
            raise ValueError(f'Parameter "{key}" must be an integer, got "{raw}"')
        return int(raw)
    elif declared_type == 'number':
        if not _NUMBER_RE.match(raw):
            raise ValueError(f'Parameter "{key}" must be a number, got "{raw}"')
        return float(raw)
    elif declared_type == 'boolean':
        if raw == 'true':
            return True
        elif raw == 'false':
            return False
        raise ValueError(f'Parameter "{key}" must be true or false, got "{raw}"')
    else:
        return raw
