import pytest
from pathlib import Path
from paso.parser import parse_file, parse_string
from paso.validator import validate
from paso.types import (
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
        assert errors == []


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
