import pytest
from pathlib import Path
from usepaso.parser import parse_file, parse_string
from usepaso.validator import validate
from usepaso.types import (
    PasoDeclaration, PasoService, PasoCapability,
    PasoInput, PasoAuth, PasoPermissions
)


class TestValidateMinimal:
    def test_passes_minimal_valid_declaration(self):
        decl = PasoDeclaration(
            version="1.0",
            service=PasoService(
                name="test_service",
                description="A test service",
                base_url="https://api.example.com"
            ),
            capabilities=[]
        )
        errors = validate(decl)
        real_errors = [e for e in errors if e.level != 'warning']
        assert real_errors == []


class TestValidateVersion:
    def test_fails_on_missing_version(self):
        decl = PasoDeclaration(
            version=None,
            service=PasoService(
                name="test_service",
                description="A test service",
                base_url="https://api.example.com"
            ),
            capabilities=[]
        )
        errors = validate(decl)
        assert any(e.path == 'version' and 'required' in e.message for e in errors)

    def test_fails_on_wrong_version(self):
        decl = PasoDeclaration(
            version="2.0",
            service=PasoService(
                name="test_service",
                description="A test service",
                base_url="https://api.example.com"
            ),
            capabilities=[]
        )
        errors = validate(decl)
        assert any(e.path == 'version' and '1.0' in e.message for e in errors)


class TestValidateService:
    def test_fails_on_missing_service_name(self):
        decl = PasoDeclaration(
            version="1.0",
            service=PasoService(
                name=None,
                description="A test service",
                base_url="https://api.example.com"
            ),
            capabilities=[]
        )
        errors = validate(decl)
        assert any('service.name' in e.path for e in errors)

    def test_fails_on_invalid_base_url(self):
        decl = PasoDeclaration(
            version="1.0",
            service=PasoService(
                name="test_service",
                description="A test service",
                base_url="not-a-valid-url"
            ),
            capabilities=[]
        )
        errors = validate(decl)
        assert any(e.path == 'service.base_url' and 'valid URL' in e.message for e in errors)

    def test_warns_on_http_base_url(self):
        decl = PasoDeclaration(
            version="1.0",
            service=PasoService(
                name="test_service",
                description="A test service",
                base_url="http://api.example.com"
            ),
            capabilities=[]
        )
        errors = validate(decl)
        http_warning = [e for e in errors if e.path == 'service.base_url' and e.level == 'warning']
        assert len(http_warning) == 1
        assert 'https://' in http_warning[0].message


class TestValidateCapability:
    def test_fails_on_non_snake_case_capability_name(self):
        cap = PasoCapability(
            name="InvalidName",
            description="A capability",
            method="GET",
            path="/test",
            permission="read"
        )
        decl = PasoDeclaration(
            version="1.0",
            service=PasoService(
                name="test_service",
                description="A test service",
                base_url="https://api.example.com"
            ),
            capabilities=[cap]
        )
        errors = validate(decl)
        assert any('snake_case' in e.message for e in errors)

    def test_fails_on_duplicate_capability_names(self):
        cap1 = PasoCapability(
            name="test_capability",
            description="First capability",
            method="GET",
            path="/test1",
            permission="read"
        )
        cap2 = PasoCapability(
            name="test_capability",
            description="Second capability",
            method="POST",
            path="/test2",
            permission="write"
        )
        decl = PasoDeclaration(
            version="1.0",
            service=PasoService(
                name="test_service",
                description="A test service",
                base_url="https://api.example.com"
            ),
            capabilities=[cap1, cap2]
        )
        errors = validate(decl)
        assert any('duplicate' in e.message for e in errors)

    def test_fails_on_invalid_http_method(self):
        cap = PasoCapability(
            name="test_capability",
            description="A capability",
            method="INVALID",
            path="/test",
            permission="read"
        )
        decl = PasoDeclaration(
            version="1.0",
            service=PasoService(
                name="test_service",
                description="A test service",
                base_url="https://api.example.com"
            ),
            capabilities=[cap]
        )
        errors = validate(decl)
        assert any('method must be one of' in e.message for e in errors)

    def test_fails_on_path_not_starting_with_slash(self):
        cap = PasoCapability(
            name="test_capability",
            description="A capability",
            method="GET",
            path="test",
            permission="read"
        )
        decl = PasoDeclaration(
            version="1.0",
            service=PasoService(
                name="test_service",
                description="A test service",
                base_url="https://api.example.com"
            ),
            capabilities=[cap]
        )
        errors = validate(decl)
        assert any('must start with /' in e.message for e in errors)


class TestValidateInput:
    def test_fails_on_enum_without_values(self):
        cap = PasoCapability(
            name="test_capability",
            description="A capability",
            method="GET",
            path="/test",
            permission="read",
            inputs={
                "status": PasoInput(
                    type="enum",
                    description="Status parameter",
                    values=None
                )
            }
        )
        decl = PasoDeclaration(
            version="1.0",
            service=PasoService(
                name="test_service",
                description="A test service",
                base_url="https://api.example.com"
            ),
            capabilities=[cap]
        )
        errors = validate(decl)
        assert any('enum type must have values' in e.message for e in errors)

    def test_fails_on_enum_with_empty_values(self):
        cap = PasoCapability(
            name="test_capability",
            description="A capability",
            method="GET",
            path="/test",
            permission="read",
            inputs={
                "status": PasoInput(
                    type="enum",
                    description="Status parameter",
                    values=[]
                )
            }
        )
        decl = PasoDeclaration(
            version="1.0",
            service=PasoService(
                name="test_service",
                description="A test service",
                base_url="https://api.example.com"
            ),
            capabilities=[cap]
        )
        errors = validate(decl)
        assert any('enum type must have values' in e.message for e in errors)


class TestValidatePath:
    def test_fails_on_path_parameter_missing_from_inputs(self):
        cap = PasoCapability(
            name="test_capability",
            description="A capability",
            method="GET",
            path="/test/{id}",
            permission="read"
        )
        decl = PasoDeclaration(
            version="1.0",
            service=PasoService(
                name="test_service",
                description="A test service",
                base_url="https://api.example.com"
            ),
            capabilities=[cap]
        )
        errors = validate(decl)
        assert any('path parameter' in e.message and 'not found' in e.message for e in errors)


class TestValidatePathParams:
    def test_fails_on_path_parameter_without_in_path(self):
        cap = PasoCapability(
            name="test_capability",
            description="A capability",
            method="GET",
            path="/test/{id}",
            permission="read",
            inputs={
                "id": PasoInput(type="string", description="The ID", in_="query"),
            }
        )
        decl = PasoDeclaration(
            version="1.0",
            service=PasoService(
                name="test_service",
                description="A test service",
                base_url="https://api.example.com"
            ),
            capabilities=[cap]
        )
        errors = validate(decl)
        assert any('must have in: path' in e.message for e in errors)

    def test_fails_on_path_parameter_with_in_omitted(self):
        cap = PasoCapability(
            name="test_capability",
            description="A capability",
            method="GET",
            path="/test/{id}",
            permission="read",
            inputs={
                "id": PasoInput(type="string", description="The ID"),
            }
        )
        decl = PasoDeclaration(
            version="1.0",
            service=PasoService(
                name="test_service",
                description="A test service",
                base_url="https://api.example.com"
            ),
            capabilities=[cap]
        )
        errors = validate(decl)
        assert any('must have in: path' in e.message for e in errors)

    def test_fails_on_body_param_for_get(self):
        cap = PasoCapability(
            name="test_capability",
            description="A capability",
            method="GET",
            path="/test",
            permission="read",
            inputs={
                "filter": PasoInput(type="string", description="Filter", in_="body"),
            }
        )
        decl = PasoDeclaration(
            version="1.0",
            service=PasoService(
                name="test_service",
                description="A test service",
                base_url="https://api.example.com"
            ),
            capabilities=[cap]
        )
        errors = validate(decl)
        assert any('body parameters are not supported' in e.message for e in errors)

    def test_fails_on_body_param_for_delete(self):
        cap = PasoCapability(
            name="test_capability",
            description="A capability",
            method="DELETE",
            path="/test",
            permission="read",
            inputs={
                "id": PasoInput(type="string", description="ID", in_="body"),
            }
        )
        decl = PasoDeclaration(
            version="1.0",
            service=PasoService(
                name="test_service",
                description="A test service",
                base_url="https://api.example.com"
            ),
            capabilities=[cap]
        )
        errors = validate(decl)
        assert any('body parameters are not supported' in e.message for e in errors)


class TestValidatePermissions:
    def test_fails_when_forbidden_overlaps_with_tier(self):
        cap = PasoCapability(
            name="test_capability",
            description="A capability",
            method="GET",
            path="/test",
            permission="read"
        )
        decl = PasoDeclaration(
            version="1.0",
            service=PasoService(
                name="test_service",
                description="A test service",
                base_url="https://api.example.com"
            ),
            capabilities=[cap],
            permissions=PasoPermissions(
                read=["test_capability"],
                forbidden=["test_capability"]
            )
        )
        errors = validate(decl)
        assert any('cannot be both in a permission tier and forbidden' in e.message for e in errors)

    def test_fails_on_unknown_capability_in_permissions(self):
        cap = PasoCapability(
            name="test_capability",
            description="A capability",
            method="GET",
            path="/test",
            permission="read"
        )
        decl = PasoDeclaration(
            version="1.0",
            service=PasoService(
                name="test_service",
                description="A test service",
                base_url="https://api.example.com"
            ),
            capabilities=[cap],
            permissions=PasoPermissions(
                read=["unknown_capability"]
            )
        )
        errors = validate(decl)
        assert any('unknown capability' in e.message for e in errors)


class TestMultiTierValidation:
    def test_fails_when_capability_in_multiple_tiers(self):
        cap = PasoCapability(
            name="test_capability",
            description="A capability",
            method="GET",
            path="/test",
            permission="read"
        )
        decl = PasoDeclaration(
            version="1.0",
            service=PasoService(
                name="test_service",
                description="A test service",
                base_url="https://api.example.com"
            ),
            capabilities=[cap],
            permissions=PasoPermissions(
                read=["test_capability"],
                write=["test_capability"]
            )
        )
        errors = validate(decl)
        assert any('multiple permission tiers' in e.message for e in errors)

    def test_warns_on_empty_permission_tier(self):
        cap = PasoCapability(
            name="test_capability",
            description="A capability",
            method="GET",
            path="/test",
            permission="read"
        )
        decl = PasoDeclaration(
            version="1.0",
            service=PasoService(
                name="test_service",
                description="A test service",
                base_url="https://api.example.com"
            ),
            capabilities=[cap],
            permissions=PasoPermissions(read=[])
        )
        errors = validate(decl)
        warnings = [e for e in errors if e.level == 'warning']
        assert any('empty array' in e.message for e in warnings)


class TestValidateWarnings:
    def test_warns_on_empty_capabilities(self):
        decl = PasoDeclaration(
            version="1.0",
            service=PasoService(
                name="test_service",
                description="A test service",
                base_url="https://api.example.com"
            ),
            capabilities=[]
        )
        errors = validate(decl)
        warnings = [e for e in errors if e.level == 'warning']
        real_errors = [e for e in errors if e.level != 'warning']
        assert len(warnings) == 1
        assert 'empty' in warnings[0].message
        assert len(real_errors) == 0


class TestParseAndValidate:
    def test_valid_yaml_returns_declaration(self):
        from usepaso import parse_and_validate
        yaml_content = """
version: "1.0"
service:
  name: Test
  description: A test
  base_url: https://api.example.com
capabilities:
  - name: get_item
    description: Get item
    method: GET
    path: /items
    permission: read
"""
        result = parse_and_validate(yaml_content)
        assert result.declaration.service.name == "Test"
        assert isinstance(result.warnings, list)

    def test_invalid_yaml_raises(self):
        from usepaso import parse_and_validate
        import pytest
        yaml_content = """
version: "2.0"
service:
  name: Test
  description: A test
  base_url: https://api.example.com
capabilities: []
"""
        with pytest.raises(ValueError, match="Validation failed"):
            parse_and_validate(yaml_content)


class TestValidateExamples:
    def test_validates_sentry_example_without_errors(self):
        example_path = Path(__file__).parent / "../../../examples/sentry/usepaso.yaml"
        decl = parse_file(str(example_path))
        errors = validate(decl)
        assert errors == []

    def test_validates_stripe_example_without_errors(self):
        example_path = Path(__file__).parent / "../../../examples/stripe/usepaso.yaml"
        decl = parse_file(str(example_path))
        errors = validate(decl)
        assert errors == []

    def test_validates_linear_example_without_errors(self):
        example_path = Path(__file__).parent / "../../../examples/linear/usepaso.yaml"
        decl = parse_file(str(example_path))
        errors = validate(decl)
        assert errors == []
