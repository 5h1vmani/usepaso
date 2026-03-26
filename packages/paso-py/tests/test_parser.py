import pytest
from pathlib import Path
from usepaso.parser import parse_string, parse_file
from usepaso.types import PasoDeclaration


class TestParseString:
    def test_parse_string_minimal_valid_yaml(self):
        yaml_content = """
version: "1.0"
service:
  name: "test_service"
  description: "A test service"
  base_url: "https://api.example.com"
capabilities: []
"""
        result = parse_string(yaml_content)
        assert isinstance(result, PasoDeclaration)
        assert result.version == "1.0"
        assert result.service.name == "test_service"
        assert result.service.description == "A test service"
        assert result.service.base_url == "https://api.example.com"
        assert result.capabilities == []

    def test_parse_string_invalid_yaml_throws(self):
        yaml_content = "{ invalid yaml ]["
        with pytest.raises(Exception):
            parse_string(yaml_content)

    def test_parse_string_non_object_yaml_throws(self):
        yaml_content = "- item1\n- item2"
        with pytest.raises(ValueError, match="expected an object"):
            parse_string(yaml_content)


class TestParseFile:
    def test_parse_file_sentry_example(self):
        example_path = Path(__file__).parent / "../../../examples/sentry/usepaso.yaml"
        result = parse_file(str(example_path))
        assert isinstance(result, PasoDeclaration)
        assert result.version == "1.0"
        assert result.service.name is not None
        assert len(result.capabilities) > 0

    def test_parse_file_stripe_example(self):
        example_path = Path(__file__).parent / "../../../examples/stripe/usepaso.yaml"
        result = parse_file(str(example_path))
        assert isinstance(result, PasoDeclaration)
        assert result.version == "1.0"
        assert result.service.name is not None
        assert len(result.capabilities) > 0

    def test_parse_file_linear_example(self):
        example_path = Path(__file__).parent / "../../../examples/linear/usepaso.yaml"
        result = parse_file(str(example_path))
        assert isinstance(result, PasoDeclaration)
        assert result.version == "1.0"
        assert result.service.name is not None
        assert len(result.capabilities) > 0

    def test_parse_file_missing_file_throws(self):
        with pytest.raises(FileNotFoundError):
            parse_file("/nonexistent/path/to/usepaso.yaml")
