"""Tests for URL redaction utility."""

from usepaso.utils.redact import redact_url


class TestRedactUrl:
    def test_redacts_api_key(self):
        result = redact_url('https://api.example.com/v1?api_key=sk-1234567890')
        assert 'api_key=***' in result
        assert 'sk-1234567890' not in result

    def test_redacts_token(self):
        assert 'token=***' in redact_url('https://api.example.com/v1?token=abc123')

    def test_redacts_access_token(self):
        assert 'access_token=***' in redact_url('https://api.example.com/v1?access_token=xyz')

    def test_redacts_password(self):
        assert 'password=***' in redact_url('https://api.example.com/v1?password=hunter2')

    def test_preserves_non_sensitive_params(self):
        url = 'https://api.example.com/v1?status=active&limit=10'
        assert redact_url(url) == url

    def test_redacts_only_sensitive_when_mixed(self):
        result = redact_url('https://api.example.com/v1?status=active&api_key=sk-123&limit=10')
        assert 'api_key=***' in result
        assert 'status=active' in result
        assert 'limit=10' in result
        assert 'sk-123' not in result

    def test_no_query_params(self):
        url = 'https://api.example.com/v1/items'
        assert redact_url(url) == url

    def test_invalid_url(self):
        assert redact_url('not-a-url') == 'not-a-url'

    def test_case_insensitive(self):
        assert '***' in redact_url('https://api.example.com?API_KEY=secret')
