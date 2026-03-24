from dataclasses import dataclass, field
from typing import List

from paso.parser import parse_file, parse_string
from paso.validator import validate
from paso.types import PasoDeclaration, ValidationError
from paso.executor import build_request, execute_request, format_error

__all__ = [
    "parse_file", "parse_string", "validate",
    "parse_and_validate", "parse_file_and_validate",
    "ParseResult",
    "build_request", "execute_request", "format_error",
    "generate_mcp_server",
]


def generate_mcp_server(*args, **kwargs):
    """Generate a FastMCP server from a Paso declaration. Lazy-imports mcp dependency."""
    from paso.generators.mcp import generate_mcp_server as _generate
    return _generate(*args, **kwargs)


@dataclass
class ParseResult:
    """Result of parsing and validating a YAML declaration."""
    declaration: PasoDeclaration
    warnings: List[ValidationError] = field(default_factory=list)


def parse_and_validate(content: str) -> ParseResult:
    """Parse a YAML string and validate it. Raises ValueError if validation fails.
    Returns a ParseResult with both the declaration and any warnings."""
    decl = parse_string(content)
    errors = validate(decl)
    real_errors = [e for e in errors if getattr(e, 'level', 'error') != 'warning']
    warnings = [e for e in errors if getattr(e, 'level', 'error') == 'warning']
    if real_errors:
        msgs = '\n'.join(f'  {e.path}: {e.message}' for e in real_errors)
        raise ValueError(f'Validation failed:\n{msgs}')
    return ParseResult(declaration=decl, warnings=warnings)


def parse_file_and_validate(file_path: str) -> ParseResult:
    """Parse a YAML file and validate it. Raises ValueError if validation fails.
    Returns a ParseResult with both the declaration and any warnings."""
    decl = parse_file(file_path)
    errors = validate(decl)
    real_errors = [e for e in errors if getattr(e, 'level', 'error') != 'warning']
    warnings = [e for e in errors if getattr(e, 'level', 'error') == 'warning']
    if real_errors:
        msgs = '\n'.join(f'  {e.path}: {e.message}' for e in real_errors)
        raise ValueError(f'Validation failed:\n{msgs}')
    return ParseResult(declaration=decl, warnings=warnings)
