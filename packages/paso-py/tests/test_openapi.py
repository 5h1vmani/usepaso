"""Tests for the OpenAPI-to-usepaso converter — mirrors paso-js/tests/openapi.test.ts."""

from usepaso.openapi import generate_from_openapi, MAX_CAPABILITIES
from usepaso.parser import parse_string
from usepaso.validator import validate


def _minimal_spec(**overrides):
    """Helper to build a minimal valid OpenAPI spec."""
    spec = {
        "openapi": "3.0.0",
        "info": {"title": "Test API", "version": "1.0"},
        "servers": [{"url": "https://api.example.com"}],
        "paths": {},
    }
    spec.update(overrides)
    return spec


def _assert_valid_yaml(yaml_str):
    """Parse and validate generated YAML, return declaration."""
    decl = parse_string(yaml_str)
    errors = [e for e in validate(decl) if e.level != "warning"]
    assert errors == [], f"Validation errors: {errors}"
    return decl


class TestGenerateFromOpenApi:
    def test_excludes_head_operations(self):
        spec = _minimal_spec(paths={
            "/health": {
                "head": {
                    "operationId": "healthCheck",
                    "summary": "Health check",
                    "responses": {"200": {"description": "OK"}},
                },
                "get": {
                    "operationId": "getHealth",
                    "summary": "Get health status",
                    "responses": {"200": {"description": "OK"}},
                },
            },
        })

        result = generate_from_openapi(spec)
        assert result["generated_count"] == 1
        assert "get_health" in result["yaml"]
        assert "health_check" not in result["yaml"]
        _assert_valid_yaml(result["yaml"])

    def test_generates_valid_yaml_from_minimal_spec(self):
        spec = _minimal_spec(
            info={"title": "Pet Store", "description": "A pet store API", "version": "1.0"},
            servers=[{"url": "https://api.petstore.com/v1"}],
            paths={
                "/pets": {
                    "get": {
                        "operationId": "listPets",
                        "summary": "List all pets",
                        "responses": {"200": {"description": "A list of pets"}},
                    },
                    "post": {
                        "operationId": "createPet",
                        "summary": "Create a pet",
                        "requestBody": {
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "properties": {
                                            "name": {"type": "string", "description": "Pet name"},
                                        },
                                        "required": ["name"],
                                    },
                                },
                            },
                        },
                        "responses": {"201": {"description": "Pet created"}},
                    },
                },
            },
            components={
                "securitySchemes": {
                    "bearerAuth": {"type": "http", "scheme": "bearer"},
                },
            },
        )

        result = generate_from_openapi(spec)
        assert result["service_name"] == "Pet Store"
        assert result["auth_type"] == "bearer"
        assert result["generated_count"] == 2
        assert result["read_count"] == 1
        assert result["write_count"] == 1
        _assert_valid_yaml(result["yaml"])


class TestAuthDetection:
    def test_detects_bearer_auth(self):
        spec = _minimal_spec(
            paths={"/a": {"get": {"summary": "x", "responses": {"200": {"description": "OK"}}}}},
            components={"securitySchemes": {"auth": {"type": "http", "scheme": "bearer"}}},
        )
        assert generate_from_openapi(spec)["auth_type"] == "bearer"

    def test_detects_jwt_as_bearer(self):
        spec = _minimal_spec(
            paths={"/a": {"get": {"summary": "x", "responses": {"200": {"description": "OK"}}}}},
            components={"securitySchemes": {"auth": {"type": "http", "scheme": "jwt"}}},
        )
        assert generate_from_openapi(spec)["auth_type"] == "bearer"

    def test_detects_api_key(self):
        spec = _minimal_spec(
            paths={"/a": {"get": {"summary": "x", "responses": {"200": {"description": "OK"}}}}},
            components={"securitySchemes": {"auth": {"type": "apiKey", "in": "header", "name": "X-API-Key"}}},
        )
        result = generate_from_openapi(spec)
        assert result["auth_type"] == "api_key"
        assert "X-API-Key" in result["yaml"]

    def test_detects_oauth2(self):
        spec = _minimal_spec(
            paths={"/a": {"get": {"summary": "x", "responses": {"200": {"description": "OK"}}}}},
            components={"securitySchemes": {"auth": {"type": "oauth2", "flows": {}}}},
        )
        assert generate_from_openapi(spec)["auth_type"] == "oauth2"

    def test_no_auth_defaults_to_none(self):
        spec = _minimal_spec(
            paths={"/a": {"get": {"summary": "x", "responses": {"200": {"description": "OK"}}}}},
        )
        assert generate_from_openapi(spec)["auth_type"] == "none"


class TestRefResolution:
    def test_resolves_simple_ref(self):
        spec = _minimal_spec(
            paths={
                "/pets": {
                    "get": {
                        "operationId": "listPets",
                        "summary": "List pets",
                        "parameters": [{"$ref": "#/components/parameters/LimitParam"}],
                        "responses": {"200": {"description": "OK"}},
                    },
                },
            },
            components={
                "parameters": {
                    "LimitParam": {
                        "name": "limit",
                        "in": "query",
                        "schema": {"type": "integer"},
                        "description": "Max results",
                    },
                },
            },
        )
        result = generate_from_openapi(spec)
        assert "limit" in result["yaml"]
        _assert_valid_yaml(result["yaml"])

    def test_resolves_nested_ref(self):
        spec = _minimal_spec(
            paths={
                "/pets": {
                    "post": {
                        "operationId": "createPet",
                        "summary": "Create pet",
                        "requestBody": {
                            "content": {
                                "application/json": {
                                    "schema": {"$ref": "#/components/schemas/Pet"},
                                },
                            },
                        },
                        "responses": {"201": {"description": "Created"}},
                    },
                },
            },
            components={
                "schemas": {
                    "Pet": {
                        "properties": {
                            "name": {"type": "string", "description": "Pet name"},
                            "breed": {"$ref": "#/components/schemas/Breed"},
                        },
                        "required": ["name"],
                    },
                    "Breed": {"type": "string", "description": "Breed name"},
                },
            },
        )
        result = generate_from_openapi(spec)
        assert "name" in result["yaml"]
        _assert_valid_yaml(result["yaml"])

    def test_handles_circular_ref(self):
        spec = _minimal_spec(
            paths={
                "/nodes": {
                    "get": {
                        "operationId": "listNodes",
                        "summary": "List nodes",
                        "responses": {
                            "200": {
                                "description": "OK",
                                "content": {
                                    "application/json": {
                                        "schema": {"$ref": "#/components/schemas/Node"},
                                    },
                                },
                            },
                        },
                    },
                },
            },
            components={
                "schemas": {
                    "Node": {
                        "properties": {
                            "id": {"type": "string"},
                            "children": {
                                "type": "array",
                                "items": {"$ref": "#/components/schemas/Node"},
                            },
                        },
                    },
                },
            },
        )
        # Should not throw — circular refs are handled gracefully
        result = generate_from_openapi(spec)
        assert result["generated_count"] == 1
        _assert_valid_yaml(result["yaml"])


class TestRequestBodyExtraction:
    def test_extracts_body_params_from_post(self):
        spec = _minimal_spec(paths={
            "/users": {
                "post": {
                    "operationId": "createUser",
                    "summary": "Create a user",
                    "requestBody": {
                        "content": {
                            "application/json": {
                                "schema": {
                                    "properties": {
                                        "email": {"type": "string", "description": "Email"},
                                        "name": {"type": "string", "description": "Name"},
                                    },
                                    "required": ["email"],
                                },
                            },
                        },
                    },
                    "responses": {"201": {"description": "Created"}},
                },
            },
        })
        result = generate_from_openapi(spec)
        assert "email" in result["yaml"]
        assert "name" in result["yaml"]
        decl = _assert_valid_yaml(result["yaml"])
        cap = decl.capabilities[0]
        assert cap.inputs["email"].required is True
        assert cap.inputs["name"].required is False


class TestPathParameterAutoInjection:
    def test_auto_injects_path_params(self):
        spec = _minimal_spec(paths={
            "/orgs/{org_id}/projects/{project_id}": {
                "get": {
                    "operationId": "getProject",
                    "summary": "Get a project",
                    "responses": {"200": {"description": "OK"}},
                },
            },
        })
        result = generate_from_openapi(spec)
        decl = _assert_valid_yaml(result["yaml"])
        cap = decl.capabilities[0]
        assert "org_id" in cap.inputs
        assert "project_id" in cap.inputs
        assert cap.inputs["org_id"].in_ == "path"
        assert cap.inputs["project_id"].in_ == "path"
        assert cap.inputs["org_id"].required is True


class TestNameDeduplication:
    def test_deduplicates_capability_names(self):
        spec = _minimal_spec(paths={
            "/v1/pets": {
                "get": {
                    "operationId": "listPets",
                    "summary": "List pets v1",
                    "responses": {"200": {"description": "OK"}},
                },
            },
            "/v2/pets": {
                "get": {
                    "operationId": "listPets",
                    "summary": "List pets v2",
                    "responses": {"200": {"description": "OK"}},
                },
            },
        })
        result = generate_from_openapi(spec)
        assert result["generated_count"] == 2
        yaml_content = result["yaml"]
        assert "list_pets" in yaml_content
        assert "list_pets_1" in yaml_content
        _assert_valid_yaml(yaml_content)


class TestMaxCapabilitiesCap:
    def test_caps_at_max_capabilities(self):
        paths = {}
        for i in range(MAX_CAPABILITIES + 5):
            paths[f"/endpoint_{i}"] = {
                "get": {
                    "operationId": f"op_{i}",
                    "summary": f"Operation {i}",
                    "responses": {"200": {"description": "OK"}},
                },
            }
        spec = _minimal_spec(paths=paths)
        result = generate_from_openapi(spec)
        assert result["generated_count"] == MAX_CAPABILITIES
        assert result["total_operations"] == MAX_CAPABILITIES + 5
        _assert_valid_yaml(result["yaml"])


class TestDeprecatedExclusion:
    def test_excludes_deprecated_operations(self):
        spec = _minimal_spec(paths={
            "/active": {
                "get": {
                    "operationId": "activeOp",
                    "summary": "Active",
                    "responses": {"200": {"description": "OK"}},
                },
            },
            "/old": {
                "get": {
                    "operationId": "oldOp",
                    "summary": "Old",
                    "deprecated": True,
                    "responses": {"200": {"description": "OK"}},
                },
            },
        })
        result = generate_from_openapi(spec)
        assert result["generated_count"] == 1
        assert "active_op" in result["yaml"]
        assert "old_op" not in result["yaml"]


class TestPermissionMapping:
    def test_get_maps_to_read(self):
        spec = _minimal_spec(paths={
            "/items": {"get": {"summary": "List", "responses": {"200": {"description": "OK"}}}},
        })
        result = generate_from_openapi(spec)
        assert result["read_count"] == 1

    def test_post_maps_to_write(self):
        spec = _minimal_spec(paths={
            "/items": {"post": {"summary": "Create", "responses": {"201": {"description": "Created"}}}},
        })
        result = generate_from_openapi(spec)
        assert result["write_count"] == 1

    def test_delete_maps_to_admin(self):
        spec = _minimal_spec(paths={
            "/items/{id}": {"delete": {"summary": "Delete", "responses": {"204": {"description": "Deleted"}}}},
        })
        result = generate_from_openapi(spec)
        assert result["admin_count"] == 1

    def test_delete_requires_consent(self):
        spec = _minimal_spec(paths={
            "/items/{id}": {"delete": {"summary": "Delete", "responses": {"204": {"description": "Deleted"}}}},
        })
        result = generate_from_openapi(spec)
        assert "consent_required: true" in result["yaml"]
