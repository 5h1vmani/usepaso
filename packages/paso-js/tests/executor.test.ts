import { describe, it, expect } from 'vitest';
import { buildRequest } from '../src/executor';
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
    const original = process.env.USEPASO_AUTH_TOKEN;
    process.env.USEPASO_AUTH_TOKEN = 'test-token';
    try {
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
      const req = buildRequest(cap, {}, decl);
      expect(req.headers['Authorization']).toBe('Bearer test-token');
    } finally {
      if (original === undefined) delete process.env.USEPASO_AUTH_TOKEN;
      else process.env.USEPASO_AUTH_TOKEN = original;
    }
  });

  it('skips auth header when type is none even if token is set', () => {
    const original = process.env.USEPASO_AUTH_TOKEN;
    process.env.USEPASO_AUTH_TOKEN = 'test-token';
    try {
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
      const req = buildRequest(cap, {}, decl);
      expect(req.headers['Authorization']).toBeUndefined();
    } finally {
      if (original === undefined) delete process.env.USEPASO_AUTH_TOKEN;
      else process.env.USEPASO_AUTH_TOKEN = original;
    }
  });

  it('uses Authorization header for api_key auth type', () => {
    const original = process.env.USEPASO_AUTH_TOKEN;
    process.env.USEPASO_AUTH_TOKEN = 'sk-test-key';
    try {
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
      const req = buildRequest(cap, {}, decl);
      expect(req.headers['Authorization']).toBe('sk-test-key');
    } finally {
      if (original === undefined) delete process.env.USEPASO_AUTH_TOKEN;
      else process.env.USEPASO_AUTH_TOKEN = original;
    }
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
