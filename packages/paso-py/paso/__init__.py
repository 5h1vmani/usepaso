from paso.parser import parse_file, parse_string
from paso.validator import validate

__all__ = [
    "parse_file", "parse_string", "validate",
    "parse_and_validate", "parse_file_and_validate",
]


def parse_and_validate(content: str):
    """Parse a YAML string and validate it. Raises ValueError if validation fails."""
    decl = parse_string(content)
    errors = validate(decl)
    real_errors = [e for e in errors if getattr(e, 'level', 'error') != 'warning']
    if real_errors:
        msgs = '\n'.join(f'  {e.path}: {e.message}' for e in real_errors)
        raise ValueError(f'Validation failed:\n{msgs}')
    return decl


def parse_file_and_validate(file_path: str):
    """Parse a YAML file and validate it. Raises ValueError if validation fails."""
    decl = parse_file(file_path)
    errors = validate(decl)
    real_errors = [e for e in errors if getattr(e, 'level', 'error') != 'warning']
    if real_errors:
        msgs = '\n'.join(f'  {e.path}: {e.message}' for e in real_errors)
        raise ValueError(f'Validation failed:\n{msgs}')
    return decl
