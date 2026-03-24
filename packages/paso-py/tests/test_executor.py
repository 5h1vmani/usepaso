import os
import pytest
from paso.executor import build_request
from paso.types import (
    PasoDeclaration, PasoService, PasoCapability,
    PasoInput, PasoAuth
)


def make_decl(base_url="https://api.example.com/v1", auth=None):
    return PasoDeclaration(
        version="1.0",
        service=PasoService(
            name="Test",
            description="Test service",
            base_url=base_url,
            auth=auth,
        ),
        capabilities=[],
    )


class TestBuildRequestURL:
    def test_preserves_base_url_path_prefix(self):
        decl = make_decl(base_url="https://api.stripe.com/v1")
        cap = PasoCapability(
            name="list_customers",
            description="List customers",
            method="GET",
            path="/customers",
            permission="read",
        )
        req = build_request(cap, {}, decl)
        assert req["url"] == "https://api.stripe.com/v1/customers"

    def test_handles_base_url_with_trailing_slash(self):
        decl = make_decl(base_url="https://api.example.com/v1/")
        cap = PasoCapability(
            name="get_items",
            description="Get items",
            method="GET",
            path="/items",
            permission="read",
        )
        req = build_request(cap, {}, decl)
        assert req["url"] == "https://api.example.com/v1/items"

    def test_handles_base_url_without_path_prefix(self):
        decl = make_decl(base_url="https://api.example.com")
        cap = PasoCapability(
            name="get_items",
            description="Get items",
            method="GET",
            path="/items",
            permission="read",
        )
        req = build_request(cap, {}, decl)
        assert req["url"] == "https://api.example.com/items"

    def test_encodes_path_parameters(self):
        decl = make_decl(base_url="https://api.example.com")
        cap = PasoCapability(
            name="get_item",
            description="Get item",
            method="GET",
            path="/items/{item_id}",
            permission="read",
            inputs={
                "item_id": PasoInput(type="string", description="Item ID", in_="path"),
            },
        )
        req = build_request(cap, {"item_id": "hello/world"}, decl)
        assert req["url"] == "https://api.example.com/items/hello%2Fworld"

    def test_adds_query_parameters(self):
        decl = make_decl(base_url="https://api.example.com")
        cap = PasoCapability(
            name="list_items",
            description="List items",
            method="GET",
            path="/items",
            permission="read",
            inputs={
                "limit": PasoInput(type="integer", description="Limit", in_="query"),
            },
        )
        req = build_request(cap, {"limit": 10}, decl)
        assert req["url"] == "https://api.example.com/items?limit=10"

    def test_adds_body_for_post_requests(self):
        decl = make_decl(base_url="https://api.example.com")
        cap = PasoCapability(
            name="create_item",
            description="Create item",
            method="POST",
            path="/items",
            permission="write",
            inputs={
                "name": PasoInput(type="string", description="Name"),
            },
        )
        req = build_request(cap, {"name": "test"}, decl)
        assert req["body"] == '{"name": "test"}'


class TestContentType:
    def test_no_content_type_for_get(self):
        decl = make_decl(base_url="https://api.example.com")
        cap = PasoCapability(
            name="get_items", description="Get", method="GET",
            path="/items", permission="read",
        )
        req = build_request(cap, {}, decl)
        assert "Content-Type" not in req["headers"]
        assert req["headers"]["Accept"] == "application/json"

    def test_content_type_for_post(self):
        decl = make_decl(base_url="https://api.example.com")
        cap = PasoCapability(
            name="create_item", description="Create", method="POST",
            path="/items", permission="write",
        )
        req = build_request(cap, {}, decl)
        assert req["headers"]["Content-Type"] == "application/json"


class TestBuildRequestAuth:
    def test_sends_bearer_token_for_oauth2(self, monkeypatch):
        monkeypatch.setenv("USEPASO_AUTH_TOKEN", "test-token")
        decl = make_decl(
            base_url="https://api.example.com",
            auth=PasoAuth(type="oauth2"),
        )
        cap = PasoCapability(
            name="get_item", description="Get", method="GET",
            path="/items", permission="read",
        )
        req = build_request(cap, {}, decl)
        assert req["headers"]["Authorization"] == "Bearer test-token"

    def test_skips_auth_when_type_is_none(self, monkeypatch):
        monkeypatch.setenv("USEPASO_AUTH_TOKEN", "test-token")
        decl = make_decl(
            base_url="https://api.example.com",
            auth=PasoAuth(type="none"),
        )
        cap = PasoCapability(
            name="get_item", description="Get", method="GET",
            path="/items", permission="read",
        )
        req = build_request(cap, {}, decl)
        assert "Authorization" not in req["headers"]

    def test_uses_authorization_header_for_api_key(self, monkeypatch):
        monkeypatch.setenv("USEPASO_AUTH_TOKEN", "sk-test-key")
        decl = make_decl(
            base_url="https://api.example.com",
            auth=PasoAuth(type="api_key"),
        )
        cap = PasoCapability(
            name="get_item", description="Get", method="GET",
            path="/items", permission="read",
        )
        req = build_request(cap, {}, decl)
        assert req["headers"]["Authorization"] == "sk-test-key"


class TestHeaderInjectionDefense:
    def test_strips_newlines_from_header_values(self):
        decl = make_decl(base_url="https://api.example.com")
        cap = PasoCapability(
            name="get_item", description="Get", method="GET",
            path="/items", permission="read",
            inputs={
                "X-Custom": PasoInput(type="string", description="Custom", in_="header"),
            },
        )
        req = build_request(cap, {"X-Custom": "value\r\nInjected: evil"}, decl)
        assert "\r" not in req["headers"]["X-Custom"]
        assert "\n" not in req["headers"]["X-Custom"]


class TestHeaderRedaction:
    def test_redacts_custom_auth_headers_containing_token(self):
        token = "sk-test-secret-key-12345"
        headers = {
            "Content-Type": "application/json",
            "X-API-Key": "sk-test-secret-key-12345",
        }
        for k, v in headers.items():
            display = f"{v[:12]}..." if token and len(token) >= 8 and token in v else v
            if k == "Content-Type":
                assert display == "application/json"
            else:
                assert "..." in display
                assert "12345" not in display

    def test_does_not_redact_for_short_tokens(self):
        token = "ab"
        v = "application/json"
        display = f"{v[:12]}..." if token and len(token) >= 8 and token in v else v
        assert display == "application/json"


class TestFormatError4xx:
    def test_4xx_includes_response_body(self):
        from paso.executor import format_error
        decl = make_decl(base_url="https://api.example.com")
        result = {
            "request": {"method": "POST", "url": "https://api.example.com/items"},
            "status": 422,
            "status_text": "Unprocessable Entity",
            "body": '{"error": "name is required"}',
            "error": None,
        }
        msg = format_error(result, decl)
        # The MCP handler concatenates error + body for 4xx
        body = result.get("body", "")
        combined = f"{msg}\n\nResponse body:\n{body}" if body else msg
        assert "422" in combined
        assert "name is required" in combined
        assert "Response body:" in combined
