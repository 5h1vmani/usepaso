import { describe, it, expect, vi } from 'vitest';
import { buildRequest, executeRequest, formatError, formatStructuredError } from '../src/executor';
import { PasoDeclaration } from '../src/types';

function makeDecl(overrides: Partial<PasoDeclaration['service']> = {}): PasoDeclaration {
  return {
    version: '1.0',
    service: {
      name: 'Test',
      description: 'Test service',
      base_url: 'https://api.example.com/v1',
      ...overrides,
    },
    capabilities: [],
  };
}

describe('buildRequest URL construction', () => {
  it('preserves base_url path prefix', () => {
    const decl = makeDecl({ base_url: 'https://api.stripe.com/v1' });
    const cap = {
      name: 'list_customers',
      description: 'List customers',
      method: 'GET',
      path: '/customers',
      permission: 'read' as const,
    };
    const req = buildRequest(cap, {}, decl);
    expect(req.url).toBe('https://api.stripe.com/v1/customers');
  });

  it('handles base_url with trailing slash', () => {
    const decl = makeDecl({ base_url: 'https://api.example.com/v1/' });
    const cap = {
      name: 'get_items',
      description: 'Get items',
      method: 'GET',
      path: '/items',
      permission: 'read' as const,
    };
    const req = buildRequest(cap, {}, decl);
    expect(req.url).toBe('https://api.example.com/v1/items');
  });

  it('handles base_url without path prefix', () => {
    const decl = makeDecl({ base_url: 'https://api.example.com' });
    const cap = {
      name: 'get_items',
      description: 'Get items',
      method: 'GET',
      path: '/items',
      permission: 'read' as const,
    };
    const req = buildRequest(cap, {}, decl);
    expect(req.url).toBe('https://api.example.com/items');
  });

  it('encodes path parameters', () => {
    const decl = makeDecl({ base_url: 'https://api.example.com' });
    const cap = {
      name: 'get_item',
      description: 'Get item',
      method: 'GET',
      path: '/items/{item_id}',
      permission: 'read' as const,
      inputs: {
        item_id: { type: 'string' as const, description: 'Item ID', in: 'path' as const },
      },
    };
    const req = buildRequest(cap, { item_id: 'hello/world' }, decl);
    expect(req.url).toBe('https://api.example.com/items/hello%2Fworld');
  });

  it('adds query parameters', () => {
    const decl = makeDecl({ base_url: 'https://api.example.com' });
    const cap = {
      name: 'list_items',
      description: 'List items',
      method: 'GET',
      path: '/items',
      permission: 'read' as const,
      inputs: {
        limit: { type: 'integer' as const, description: 'Limit', in: 'query' as const },
      },
    };
    const req = buildRequest(cap, { limit: 10 }, decl);
    expect(req.url).toBe('https://api.example.com/items?limit=10');
  });

  it('adds body for POST requests', () => {
    const decl = makeDecl({ base_url: 'https://api.example.com' });
    const cap = {
      name: 'create_item',
      description: 'Create item',
      method: 'POST',
      path: '/items',
      permission: 'write' as const,
      inputs: {
        name: { type: 'string' as const, description: 'Name' },
      },
    };
    const req = buildRequest(cap, { name: 'test' }, decl);
    expect(req.body).toBe('{"name":"test"}');
  });
});

describe('buildRequest Content-Type handling', () => {
  it('does not send Content-Type for GET requests', () => {
    const decl = makeDecl({ base_url: 'https://api.example.com' });
    const cap = {
      name: 'get_items',
      description: 'Get',
      method: 'GET',
      path: '/items',
      permission: 'read' as const,
    };
    const req = buildRequest(cap, {}, decl);
    expect(req.headers['Content-Type']).toBeUndefined();
    expect(req.headers['Accept']).toBe('application/json');
  });

  it('sends Content-Type for POST requests', () => {
    const decl = makeDecl({ base_url: 'https://api.example.com' });
    const cap = {
      name: 'create_item',
      description: 'Create',
      method: 'POST',
      path: '/items',
      permission: 'write' as const,
    };
    const req = buildRequest(cap, {}, decl);
    expect(req.headers['Content-Type']).toBe('application/json');
  });
});

describe('buildRequest auth handling', () => {
  it('sends Bearer token for oauth2 auth type', () => {
    const decl = makeDecl({
      base_url: 'https://api.example.com',
      auth: { type: 'oauth2' },
    });
    const cap = {
      name: 'get_item',
      description: 'Get',
      method: 'GET',
      path: '/items',
      permission: 'read' as const,
    };
    const req = buildRequest(cap, {}, decl, 'test-token');
    expect(req.headers['Authorization']).toBe('Bearer test-token');
  });

  it('skips auth header when type is none even if token is set', () => {
    const decl = makeDecl({
      base_url: 'https://api.example.com',
      auth: { type: 'none' },
    });
    const cap = {
      name: 'get_item',
      description: 'Get',
      method: 'GET',
      path: '/items',
      permission: 'read' as const,
    };
    const req = buildRequest(cap, {}, decl, 'test-token');
    expect(req.headers['Authorization']).toBeUndefined();
  });

  it('uses Authorization header for api_key auth type', () => {
    const decl = makeDecl({
      base_url: 'https://api.example.com',
      auth: { type: 'api_key' },
    });
    const cap = {
      name: 'get_item',
      description: 'Get',
      method: 'GET',
      path: '/items',
      permission: 'read' as const,
    };
    const req = buildRequest(cap, {}, decl, 'sk-test-key');
    expect(req.headers['Authorization']).toBe('sk-test-key');
  });
});

describe('buildRequest header injection defense', () => {
  it('strips newlines from header input values', () => {
    const decl = makeDecl({ base_url: 'https://api.example.com' });
    const cap = {
      name: 'get_item',
      description: 'Get',
      method: 'GET',
      path: '/items',
      permission: 'read' as const,
      inputs: {
        'X-Custom': {
          type: 'string' as const,
          description: 'Custom header',
          in: 'header' as const,
        },
      },
    };
    const req = buildRequest(cap, { 'X-Custom': 'value\r\nInjected: evil' }, decl);
    expect(req.headers['X-Custom']).toBe('valueInjected: evil');
    expect(req.headers['X-Custom']).not.toContain('\r');
    expect(req.headers['X-Custom']).not.toContain('\n');
  });
});

describe('header redaction logic', () => {
  it('redacts custom auth headers containing the token', () => {
    const token = 'sk-test-secret-key-12345';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': 'sk-test-secret-key-12345',
      Authorization: 'Bearer sk-test-secret-key-12345',
    };
    for (const [k, v] of Object.entries(headers)) {
      const display = token && v.includes(token) ? `${v.slice(0, 12)}...` : v;
      if (k === 'Content-Type') {
        expect(display).toBe('application/json');
      } else {
        expect(display).toContain('...');
        expect(display).not.toContain('12345');
      }
    }
  });

  it('does not redact headers when token is short to avoid false positives', () => {
    // Short tokens could match normal header values — guard against this
    const token = 'ab';
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    for (const [, v] of Object.entries(headers)) {
      // With a short token, 'ab' is in 'application/json' — should NOT redact
      const display = token && token.length >= 8 && v.includes(token) ? `${v.slice(0, 12)}...` : v;
      expect(display).toBe('application/json');
    }
  });
});

describe('executeRequest', () => {
  it('returns parsed JSON body on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve('{"id":1,"name":"test"}'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await executeRequest({
      method: 'GET',
      url: 'https://api.example.com/items',
      headers: { Accept: 'application/json' },
    });

    expect(result.status).toBe(200);
    expect(result.body).toContain('"id": 1');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('returns raw text for non-JSON response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: new Headers({}),
      text: () => Promise.resolve('plain text response'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await executeRequest({
      method: 'GET',
      url: 'https://api.example.com/health',
      headers: {},
    });

    expect(result.body).toBe('plain text response');
    vi.unstubAllGlobals();
  });

  it('returns error on network failure', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('fetch failed'));
    vi.stubGlobal('fetch', mockFetch);

    const result = await executeRequest({
      method: 'GET',
      url: 'https://api.example.com/items',
      headers: {},
    });

    expect(result.error).toBe('fetch failed');
    expect(result.status).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('throws on response exceeding size limit', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-length': '20000000' }),
      text: () => Promise.resolve(''),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await executeRequest({
      method: 'GET',
      url: 'https://api.example.com/large',
      headers: {},
    });

    expect(result.error).toContain('Response too large');
    vi.unstubAllGlobals();
  });

  it('returns correct status for 4xx/5xx', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 404,
      statusText: 'Not Found',
      headers: new Headers({}),
      text: () => Promise.resolve('{"error":"not found"}'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await executeRequest({
      method: 'GET',
      url: 'https://api.example.com/missing',
      headers: {},
    });

    expect(result.status).toBe(404);
    expect(result.error).toBeUndefined();
    vi.unstubAllGlobals();
  });
});

describe('formatError', () => {
  const decl = makeDecl({
    base_url: 'https://api.example.com',
    auth: { type: 'bearer' },
  });

  it('formats 401 without token', () => {
    const result = {
      request: { method: 'GET', url: 'https://api.example.com/items', headers: {} },
      status: 401,
      statusText: 'Unauthorized',
      body: '',
      durationMs: 50,
    };
    const msg = formatError(result, decl, undefined);
    expect(msg).toContain('Error 401');
    expect(msg).toContain('USEPASO_AUTH_TOKEN is not set');
  });

  it('formats 401 with token', () => {
    const result = {
      request: { method: 'GET', url: 'https://api.example.com/items', headers: {} },
      status: 401,
      statusText: 'Unauthorized',
      body: '',
      durationMs: 50,
    };
    const msg = formatError(result, decl, 'some-token');
    expect(msg).toContain('rejected by the API');
    expect(msg).toContain('Auth type: bearer');
  });

  it('formats 403', () => {
    const result = {
      request: { method: 'GET', url: 'https://api.example.com/items', headers: {} },
      status: 403,
      body: '',
      durationMs: 50,
    };
    const msg = formatError(result, decl);
    expect(msg).toContain('Error 403');
    expect(msg).toContain('Forbidden');
  });

  it('formats 404 with URL', () => {
    const result = {
      request: { method: 'GET', url: 'https://api.example.com/missing', headers: {} },
      status: 404,
      body: '',
      durationMs: 50,
    };
    const msg = formatError(result, decl);
    expect(msg).toContain('Error 404');
    expect(msg).toContain('https://api.example.com/missing');
  });

  it('formats 429', () => {
    const result = {
      request: { method: 'GET', url: 'https://api.example.com/items', headers: {} },
      status: 429,
      body: '',
      durationMs: 50,
    };
    const msg = formatError(result, decl);
    expect(msg).toContain('Rate limited');
  });

  it('formats 5xx', () => {
    const result = {
      request: { method: 'GET', url: 'https://api.example.com/items', headers: {} },
      status: 502,
      body: '',
      durationMs: 50,
    };
    const msg = formatError(result, decl);
    expect(msg).toContain('Error 502');
    expect(msg).toContain('Server error');
  });

  it('formats connection error', () => {
    const result = {
      request: { method: 'GET', url: 'https://api.example.com/items', headers: {} },
      body: '',
      durationMs: 50,
      error: 'ECONNREFUSED',
    };
    const msg = formatError(result, decl);
    expect(msg).toContain('Request failed: ECONNREFUSED');
  });
});

describe('formatStructuredError', () => {
  const decl = makeDecl({ auth: { type: 'bearer' } });
  const baseResult = {
    request: { method: 'GET', url: 'https://api.example.com/v1/test', headers: {} },
    body: '',
    durationMs: 100,
  };

  it('returns auth_failed for 401 without token', () => {
    const result = { ...baseResult, status: 401, statusText: 'Unauthorized' };
    const err = formatStructuredError(result, decl);
    expect(err.error).toBe(true);
    expect(err.type).toBe('auth_failed');
    expect(err.status).toBe(401);
    expect(err.hint).toContain('USEPASO_AUTH_TOKEN is not set');
  });

  it('returns auth_failed for 401 with token', () => {
    const result = { ...baseResult, status: 401, statusText: 'Unauthorized' };
    const err = formatStructuredError(result, decl, 'bad-token');
    expect(err.type).toBe('auth_failed');
    expect(err.hint).toContain('rejected');
  });

  it('returns forbidden for 403', () => {
    const result = { ...baseResult, status: 403, statusText: 'Forbidden' };
    const err = formatStructuredError(result, decl);
    expect(err.type).toBe('forbidden');
  });

  it('returns not_found for 404', () => {
    const result = { ...baseResult, status: 404, statusText: 'Not Found' };
    const err = formatStructuredError(result, decl);
    expect(err.type).toBe('not_found');
    expect(err.request_url).toBe('https://api.example.com/v1/test');
  });

  it('returns rate_limited for 429', () => {
    const result = { ...baseResult, status: 429, statusText: 'Too Many Requests' };
    const err = formatStructuredError(result, decl);
    expect(err.type).toBe('rate_limited');
  });

  it('includes retry_after_seconds for 429 with header', () => {
    const result = {
      ...baseResult,
      status: 429,
      statusText: 'Too Many Requests',
      retryAfterSeconds: 30,
    };
    const err = formatStructuredError(result, decl);
    expect(err.type).toBe('rate_limited');
    expect(err.retry_after_seconds).toBe(30);
    expect(err.hint).toContain('30 seconds');
  });

  it('returns server_error for 500', () => {
    const result = { ...baseResult, status: 500, statusText: 'Internal Server Error' };
    const err = formatStructuredError(result, decl);
    expect(err.type).toBe('server_error');
  });

  it('returns network_error for connection failures', () => {
    const result = { ...baseResult, error: 'ECONNREFUSED' };
    const err = formatStructuredError(result, decl);
    expect(err.type).toBe('network_error');
    expect(err.status).toBeNull();
  });
});
