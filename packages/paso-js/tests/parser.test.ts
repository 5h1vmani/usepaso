import { describe, it, expect } from 'vitest';
import { parseString, parseFile } from '../src/parser';
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
    const filePath = join(__dirname, '../../../examples/sentry/paso.yaml');
    const result = parseFile(filePath);
    expect(result.service.name).toBe('Sentry');
    expect(result.capabilities.length).toBeGreaterThan(0);
  });

  it('parses the Stripe example', () => {
    const filePath = join(__dirname, '../../../examples/stripe/paso.yaml');
    const result = parseFile(filePath);
    expect(result.service.name).toBe('Stripe');
    expect(result.capabilities.length).toBeGreaterThan(0);
  });

  it('parses the Linear example', () => {
    const filePath = join(__dirname, '../../../examples/linear/paso.yaml');
    const result = parseFile(filePath);
    expect(result.service.name).toBe('Linear');
    expect(result.capabilities.length).toBeGreaterThan(0);
  });

  it('throws on missing file', () => {
    expect(() => parseFile('/nonexistent/paso.yaml')).toThrow();
  });
});
