import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';
import { buildRequest } from '../src/executor';
import { parseString } from '../src/parser';

const FIXTURES_DIR = join(__dirname, '../../../test-fixtures/build-request');

interface Fixture {
  description: string;
  declaration: Record<string, unknown>;
  capability: string;
  args: Record<string, unknown>;
  env?: Record<string, string>;
  expected: {
    method: string;
    url?: string;
    url_contains?: { base: string; params: Record<string, string> };
    headers?: Record<string, string>;
    headers_absent?: string[];
    body_contains?: Record<string, unknown>;
  };
}

const fixtureFiles = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.yaml'));

describe('shared test fixtures (cross-SDK parity)', () => {
  for (const file of fixtureFiles) {
    it(file.replace('.yaml', ''), () => {
      const content = readFileSync(join(FIXTURES_DIR, file), 'utf-8');
      const fixture = YAML.parse(content) as Fixture;
      const decl = parseString(YAML.stringify(fixture.declaration));
      const cap = decl.capabilities.find((c) => c.name === fixture.capability)!;

      // Set env vars for this test
      const savedEnv: Record<string, string | undefined> = {};
      if (fixture.env) {
        for (const [k, v] of Object.entries(fixture.env)) {
          savedEnv[k] = process.env[k];
          process.env[k] = v;
        }
      }

      try {
        const req = buildRequest(cap, fixture.args || {}, decl);

        expect(req.method).toBe(fixture.expected.method);

        if (fixture.expected.url) {
          expect(req.url).toBe(fixture.expected.url);
        }

        if (fixture.expected.url_contains) {
          const url = new URL(req.url);
          expect(`${url.origin}${url.pathname}`).toBe(fixture.expected.url_contains.base);
          for (const [k, v] of Object.entries(fixture.expected.url_contains.params)) {
            expect(url.searchParams.get(k)).toBe(v);
          }
        }

        if (fixture.expected.headers) {
          for (const [k, v] of Object.entries(fixture.expected.headers)) {
            expect(req.headers[k]).toBe(v);
          }
        }

        if (fixture.expected.headers_absent) {
          for (const h of fixture.expected.headers_absent) {
            expect(req.headers[h]).toBeUndefined();
          }
        }

        if (fixture.expected.body_contains) {
          const body = JSON.parse(req.body!);
          for (const [k, v] of Object.entries(fixture.expected.body_contains)) {
            expect(body[k]).toEqual(v);
          }
        }
      } finally {
        // Restore env
        for (const [k, v] of Object.entries(savedEnv)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
      }
    });
  }
});
