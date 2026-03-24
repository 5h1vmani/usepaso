import { describe, it, expect } from 'vitest';
import { parseString, parseFile } from '../src/parser';
import { parseAndValidate } from '../src/index';
import { join } from 'path';

describe('parseString', () => {
  it('parses a minimal valid declaration', () => {
    const yaml = `
version: "1.0"
service:
  name: TestService
  description: A test service
  base_url: https://api.test.com
capabilities:
  - name: get_item
    description: Get an item
    method: GET
    path: /items/{id}
    permission: read
    inputs:
      id:
        type: string
        required: true
        description: Item ID
        in: path
`;
    const result = parseString(yaml);
    expect(result.version).toBe('1.0');
    expect(result.service.name).toBe('TestService');
    expect(result.capabilities).toHaveLength(1);
    expect(result.capabilities[0].name).toBe('get_item');
  });

  it('throws on invalid YAML', () => {
    expect(() => parseString('{')).toThrow();
  });

  it('throws on non-object YAML', () => {
    expect(() => parseString('hello')).toThrow('expected an object');
  });
});

describe('parseFile', () => {
  it('parses the Sentry example', () => {
    const filePath = join(__dirname, '../../../examples/sentry/usepaso.yaml');
    const result = parseFile(filePath);
    expect(result.service.name).toBe('Sentry');
    expect(result.capabilities.length).toBeGreaterThan(0);
  });

  it('parses the Stripe example', () => {
    const filePath = join(__dirname, '../../../examples/stripe/usepaso.yaml');
    const result = parseFile(filePath);
    expect(result.service.name).toBe('Stripe');
    expect(result.capabilities.length).toBeGreaterThan(0);
  });

  it('parses the Linear example', () => {
    const filePath = join(__dirname, '../../../examples/linear/usepaso.yaml');
    const result = parseFile(filePath);
    expect(result.service.name).toBe('Linear');
    expect(result.capabilities.length).toBeGreaterThan(0);
  });

  it('throws on missing file', () => {
    expect(() => parseFile('/nonexistent/usepaso.yaml')).toThrow();
  });
});

describe('parseAndValidate', () => {
  it('returns declaration for valid YAML', () => {
    const yaml = `
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
`;
    const decl = parseAndValidate(yaml);
    expect(decl.service.name).toBe('Test');
  });

  it('throws on invalid YAML', () => {
    const yaml = `
version: "2.0"
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
`;
    expect(() => parseAndValidate(yaml)).toThrow('Validation failed');
  });
});
