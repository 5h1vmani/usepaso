import { describe, it, expect } from 'vitest';
import { generateFromOpenApi } from '../src/openapi';
import { validate } from '../src/validator';
import { parseString } from '../src/parser';

describe('generateFromOpenApi', () => {
  it('excludes HEAD operations (HEAD is not a valid method in the spec)', () => {
    // Reproduction test: before the fix, HEAD endpoints were included
    // and the generated YAML would fail validation because HEAD is not
    // in the valid methods list (GET, POST, PUT, PATCH, DELETE).
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0' },
      servers: [{ url: 'https://api.example.com' }],
      paths: {
        '/health': {
          head: {
            operationId: 'healthCheck',
            summary: 'Health check',
            responses: { '200': { description: 'OK' } },
          },
          get: {
            operationId: 'getHealth',
            summary: 'Get health status',
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const result = generateFromOpenApi(spec);

    // Should only include GET, not HEAD
    expect(result.generatedCount).toBe(1);
    expect(result.yaml).toContain('get_health');
    expect(result.yaml).not.toContain('health_check');

    // The generated YAML must pass validation
    const decl = parseString(result.yaml);
    const errors = validate(decl).filter((e) => e.level !== 'warning');
    expect(errors).toEqual([]);
  });

  it('generates valid YAML from a minimal OpenAPI spec', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Pet Store', description: 'A pet store API', version: '1.0' },
      servers: [{ url: 'https://api.petstore.com/v1' }],
      paths: {
        '/pets': {
          get: {
            operationId: 'listPets',
            summary: 'List all pets',
            responses: { '200': { description: 'A list of pets' } },
          },
          post: {
            operationId: 'createPet',
            summary: 'Create a pet',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    properties: {
                      name: { type: 'string', description: 'Pet name' },
                    },
                    required: ['name'],
                  },
                },
              },
            },
            responses: { '201': { description: 'Pet created' } },
          },
        },
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
    };

    const result = generateFromOpenApi(spec);
    expect(result.serviceName).toBe('Pet Store');
    expect(result.authType).toBe('bearer');
    expect(result.generatedCount).toBe(2);
    expect(result.readCount).toBe(1);
    expect(result.writeCount).toBe(1);

    // Must pass validation
    const decl = parseString(result.yaml);
    const errors = validate(decl).filter((e) => e.level !== 'warning');
    expect(errors).toEqual([]);
  });
});
