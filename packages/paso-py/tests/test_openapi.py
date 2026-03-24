"""Tests for the OpenAPI-to-usepaso converter — mirrors paso-js/tests/openapi.test.ts."""

from paso.openapi import generate_from_openapi
from paso.parser import parse_string
from paso.validator import validate


class TestGenerateFromOpenApi:
    def test_excludes_head_operations(self):
        """Reproduction test: HEAD endpoints were included before the fix,
        generating YAML with invalid method HEAD that would fail validation."""
        spec = {
            "openapi": "3.0.0",
            "info": {"title": "Test API", "version": "1.0"},
            "servers": [{"url": "https://api.example.com"}],
            "paths": {
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
            },
        }

        result = generate_from_openapi(spec)

        # Should only include GET, not HEAD
        assert result["generated_count"] == 1
        assert "get_health" in result["yaml"]
        assert "health_check" not in result["yaml"]

        # The generated YAML must pass validation
        decl = parse_string(result["yaml"])
        errors = [e for e in validate(decl) if e.level != "warning"]
        assert errors == []

    def test_generates_valid_yaml_from_minimal_spec(self):
        spec = {
            "openapi": "3.0.0",
            "info": {"title": "Pet Store", "description": "A pet store API", "version": "1.0"},
            "servers": [{"url": "https://api.petstore.com/v1"}],
            "paths": {
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
            "components": {
                "securitySchemes": {
                    "bearerAuth": {"type": "http", "scheme": "bearer"},
                },
            },
        }

        result = generate_from_openapi(spec)
        assert result["service_name"] == "Pet Store"
        assert result["auth_type"] == "bearer"
        assert result["generated_count"] == 2
        assert result["read_count"] == 1
        assert result["write_count"] == 1

        # Must pass validation
        decl = parse_string(result["yaml"])
        errors = [e for e in validate(decl) if e.level != "warning"]
        assert errors == []
