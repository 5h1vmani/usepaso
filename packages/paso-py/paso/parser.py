import yaml
from paso.types import PasoDeclaration


def parse_file(file_path: str) -> PasoDeclaration:
    """
    Parse a paso.yaml file from disk and return the declaration object.
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
    return PasoDeclaration.from_dict(parsed)
