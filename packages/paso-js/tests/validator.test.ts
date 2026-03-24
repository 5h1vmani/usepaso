import { describe, it, expect } from 'vitest';
import { validate } from '../src/validator';
import { parseFile } from '../src/parser';
import { PasoDeclaration } from '../src/types';
import { join } from 'path';

function minimal(): PasoDeclaration {
  return {
    version: '1.0',
    service: {
      name: 'Test',
      description: 'A test service',
      base_url: 'https://api.test.com',
    },
    capabilities: [
      {
        name: 'get_item',
        description: 'Get an item',
        method: 'GET',
        path: '/items',
        permission: 'read',
      },
    ],
  };
}

describe('validate', () => {
  it('passes a minimal valid declaration', () => {
    const errors = validate(minimal());
    expect(errors).toHaveLength(0);
  });

  it('fails on missing version', () => {
    const decl = minimal();
    (decl as any).version = undefined;
    const errors = validate(decl);
    expect(errors.some((e) => e.path === 'version')).toBe(true);
  });

  it('fails on wrong version', () => {
    const decl = minimal();
    decl.version = '2.0';
    const errors = validate(decl);
    expect(errors.some((e) => e.message.includes('must be "1.0"'))).toBe(true);
  });

  it('fails on missing service name', () => {
    const decl = minimal();
    (decl.service as any).name = '';
    const errors = validate(decl);
    expect(errors.some((e) => e.path === 'service.name')).toBe(true);
  });

  it('fails on invalid base_url', () => {
    const decl = minimal();
    decl.service.base_url = 'not-a-url';
    const errors = validate(decl);
    expect(errors.some((e) => e.path === 'service.base_url')).toBe(true);
  });

  it('warns on http:// base_url', () => {
    const decl = minimal();
    decl.service.base_url = 'http://api.example.com';
    const errors = validate(decl);
    const httpWarning = errors.find((e) => e.path === 'service.base_url' && e.level === 'warning');
    expect(httpWarning).toBeDefined();
    expect(httpWarning!.message).toContain('https://');
  });

  it('fails on non-snake_case capability name', () => {
    const decl = minimal();
    decl.capabilities[0].name = 'GetItem';
    const errors = validate(decl);
    expect(errors.some((e) => e.message.includes('snake_case'))).toBe(true);
  });

  it('fails on duplicate capability names', () => {
    const decl = minimal();
    decl.capabilities.push({ ...decl.capabilities[0] });
    const errors = validate(decl);
    expect(errors.some((e) => e.message.includes('duplicate'))).toBe(true);
  });

  it('fails on invalid HTTP method', () => {
    const decl = minimal();
    (decl.capabilities[0] as any).method = 'SEND';
    const errors = validate(decl);
    expect(errors.some((e) => e.path.includes('method'))).toBe(true);
  });

  it('fails on path not starting with /', () => {
    const decl = minimal();
    decl.capabilities[0].path = 'items';
    const errors = validate(decl);
    expect(errors.some((e) => e.message.includes('start with /'))).toBe(true);
  });

  it('fails on enum input without values', () => {
    const decl = minimal();
    decl.capabilities[0].inputs = {
      status: { type: 'enum', description: 'Status' },
    };
    const errors = validate(decl);
    expect(errors.some((e) => e.message.includes('enum type must have values'))).toBe(true);
  });

  it('fails on path parameter missing from inputs', () => {
    const decl = minimal();
    decl.capabilities[0].path = '/items/{item_id}';
    decl.capabilities[0].inputs = {};
    const errors = validate(decl);
    expect(errors.some((e) => e.message.includes('item_id'))).toBe(true);
  });

  it('fails on path parameter without in: path', () => {
    const decl = minimal();
    decl.capabilities[0].path = '/items/{item_id}';
    decl.capabilities[0].inputs = {
      item_id: { type: 'string', description: 'Item ID', in: 'query' },
    };
    const errors = validate(decl);
    expect(errors.some((e) => e.message.includes('must have in: path'))).toBe(true);
  });

  it('fails on path parameter with in omitted', () => {
    const decl = minimal();
    decl.capabilities[0].path = '/items/{item_id}';
    decl.capabilities[0].inputs = {
      item_id: { type: 'string', description: 'Item ID' },
    };
    const errors = validate(decl);
    expect(errors.some((e) => e.message.includes('must have in: path'))).toBe(true);
  });

  it('fails on body parameter for GET request', () => {
    const decl = minimal();
    decl.capabilities[0].method = 'GET';
    decl.capabilities[0].inputs = {
      filter: { type: 'string', description: 'Filter', in: 'body' },
    };
    const errors = validate(decl);
    expect(errors.some((e) => e.message.includes('body parameters are not supported'))).toBe(true);
  });

  it('fails on body parameter for DELETE request', () => {
    const decl = minimal();
    decl.capabilities[0].method = 'DELETE';
    decl.capabilities[0].inputs = {
      id: { type: 'string', description: 'ID', in: 'body' },
    };
    const errors = validate(decl);
    expect(errors.some((e) => e.message.includes('body parameters are not supported'))).toBe(true);
  });

  it('fails when forbidden overlaps with a tier', () => {
    const decl = minimal();
    decl.permissions = {
      read: ['get_item'],
      forbidden: ['get_item'],
    };
    const errors = validate(decl);
    expect(errors.some((e) => e.message.includes('cannot be both'))).toBe(true);
  });

  it('fails on unknown capability in permissions', () => {
    const decl = minimal();
    decl.permissions = {
      read: ['nonexistent'],
    };
    const errors = validate(decl);
    expect(errors.some((e) => e.message.includes('unknown capability'))).toBe(true);
  });

  it('fails when capability appears in multiple permission tiers', () => {
    const decl = minimal();
    decl.permissions = {
      read: ['get_item'],
      write: ['get_item'],
    };
    const errors = validate(decl);
    expect(errors.some((e) => e.message.includes('multiple permission tiers'))).toBe(true);
  });

  it('warns on empty permission tier array', () => {
    const decl = minimal();
    decl.permissions = {
      read: [],
    };
    const errors = validate(decl);
    const warnings = errors.filter((e) => e.level === 'warning');
    expect(warnings.some((e) => e.message.includes('empty array'))).toBe(true);
  });

  it('warns on empty capabilities array', () => {
    const decl = minimal();
    decl.capabilities = [];
    const errors = validate(decl);
    const warnings = errors.filter((e) => e.level === 'warning');
    const realErrors = errors.filter((e) => e.level !== 'warning');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('empty');
    expect(realErrors).toHaveLength(0);
  });

  it('validates example files without errors', () => {
    for (const example of ['sentry', 'stripe', 'linear']) {
      const filePath = join(__dirname, `../../../examples/${example}/usepaso.yaml`);
      const decl = parseFile(filePath);
      const errors = validate(decl);
      expect(
        errors,
        `${example} should have no validation errors: ${JSON.stringify(errors)}`,
      ).toHaveLength(0);
    }
  });
});
