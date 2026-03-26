"""Redact sensitive query parameter values from URLs for safe logging."""

from urllib.parse import urlparse, parse_qsl, urlunparse

SENSITIVE_PARAMS = frozenset({
    'api_key', 'apikey', 'api-key',
    'token', 'access_token', 'auth_token',
    'secret', 'client_secret',
    'password', 'passwd',
    'key',
})


def redact_url(url: str) -> str:
    """Replace values of sensitive query params with '***'."""
    try:
        parsed = urlparse(url)
        if not parsed.query:
            return url
        pairs = parse_qsl(parsed.query, keep_blank_values=True)
        redacted = False
        new_pairs = []
        for key, value in pairs:
            if key.lower() in SENSITIVE_PARAMS:
                new_pairs.append(f'{key}=***')
                redacted = True
            else:
                new_pairs.append(f'{key}={value}')
        if not redacted:
            return url
        new_query = '&'.join(new_pairs)
        return urlunparse(parsed._replace(query=new_query))
    except Exception:
        return url
