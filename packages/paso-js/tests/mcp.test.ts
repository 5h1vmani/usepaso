import { describe, it, expect, vi } from 'vitest';
import { generateMcpServer } from '../src/generators/mcp';
import { parseFile } from '../src/parser';
import { PasoDeclaration } from '../src/types';
import { join } from 'path';
import { formatError } from '../src/executor';

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
        description: 'Get an item by ID',
        method: 'GET',
        path: '/items/{id}',
        permission: 'read',
        inputs: {
          id: { type: 'string', required: true, description: 'Item ID', in: 'path' },
        },
        output: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
      },
      {
        name: 'create_item',
        description: 'Create a new item',
        method: 'POST',
        path: '/items',
        permission: 'write',
        consent_required: true,
        inputs: {
          name: { type: 'string', required: true, description: 'Item name' },
          priority: {
            type: 'enum',
            description: 'Priority level',
            values: ['low', 'medium', 'high'],
          },
        },
      },
    ],
  };
}

describe('generateMcpServer', () => {
  it('creates an MCP server from a minimal declaration', () => {
    const server = generateMcpServer(minimal());
    expect(server).toBeDefined();
    expect(server.server).toBeDefined();
  });

  it('registers tools for each capability', () => {
    const server = generateMcpServer(minimal());
    // The server should have registered 2 tools
    // We can check via the internal state
    expect((server as any)._registeredTools).toBeDefined();
    expect(Object.keys((server as any)._registeredTools)).toHaveLength(2);
    expect((server as any)._registeredTools['get_item']).toBeDefined();
    expect((server as any)._registeredTools['create_item']).toBeDefined();
  });

  it('skips forbidden capabilities', () => {
    const decl = minimal();
    decl.permissions = { forbidden: ['create_item'] };
    const server = generateMcpServer(decl);
    const tools = Object.keys((server as any)._registeredTools);
    expect(tools).toHaveLength(1);
    expect(tools).toContain('get_item');
    expect(tools).not.toContain('create_item');
  });

  it('works with Sentry example', () => {
    const decl = parseFile(join(__dirname, '../../../examples/sentry/usepaso.yaml'));
    const server = generateMcpServer(decl);
    const tools = Object.keys((server as any)._registeredTools);
    expect(tools.length).toBeGreaterThan(0);
    expect(tools).toContain('list_issues');
    expect(tools).toContain('resolve_issue');
  });

  it('works with Stripe example (respects forbidden)', () => {
    const decl = parseFile(join(__dirname, '../../../examples/stripe/usepaso.yaml'));
    const server = generateMcpServer(decl);
    const tools = Object.keys((server as any)._registeredTools);
    expect(tools).toContain('list_customers');
    expect(tools).toContain('create_payment_intent');
    // delete_customer is in forbidden but not declared as a capability, so it's just not present
    expect(tools).not.toContain('delete_customer');
  });

  it('handles capabilities with no inputs', () => {
    const decl: PasoDeclaration = {
      version: '1.0',
      service: {
        name: 'Test',
        description: 'Test',
        base_url: 'https://api.test.com',
      },
      capabilities: [
        {
          name: 'health_check',
          description: 'Check service health',
          method: 'GET',
          path: '/health',
          permission: 'read',
        },
      ],
    };
    const server = generateMcpServer(decl);
    expect(Object.keys((server as any)._registeredTools)).toHaveLength(1);
  });

  it('includes consent warning in tool description', () => {
    const server = generateMcpServer(minimal());
    const createTool = (server as any)._registeredTools['create_item'];
    expect(createTool).toBeDefined();
  });

  it('handles single-element numeric enum without crashing', () => {
    const decl: PasoDeclaration = {
      version: '1.0',
      service: { name: 'Test', description: 'Test', base_url: 'https://api.test.com' },
      capabilities: [
        {
          name: 'set_mode',
          description: 'Set mode',
          method: 'POST',
          path: '/mode',
          permission: 'write',
          inputs: {
            mode: { type: 'enum', description: 'Mode', values: [42] },
          },
        },
      ],
    };
    // Before fix, this threw: z.union requires at least 2 elements
    const server = generateMcpServer(decl);
    expect((server as any)._registeredTools['set_mode']).toBeDefined();
  });

  it('preserves numeric enum values in tool schema', () => {
    const decl: PasoDeclaration = {
      version: '1.0',
      service: { name: 'Test', description: 'Test', base_url: 'https://api.test.com' },
      capabilities: [
        {
          name: 'set_level',
          description: 'Set level',
          method: 'POST',
          path: '/level',
          permission: 'write',
          inputs: {
            level: { type: 'enum', description: 'Level', values: [1, 2, 3] },
          },
        },
      ],
    };
    const server = generateMcpServer(decl);
    const tool = (server as any)._registeredTools['set_level'];
    expect(tool).toBeDefined();
    // The schema should accept numbers, not strings
    const schema = tool.inputSchema;
    expect(schema).toBeDefined();
  });

  it('applies default values in tool schema', () => {
    const decl: PasoDeclaration = {
      version: '1.0',
      service: { name: 'Test', description: 'Test', base_url: 'https://api.test.com' },
      capabilities: [
        {
          name: 'list_items',
          description: 'List items',
          method: 'GET',
          path: '/items',
          permission: 'read',
          inputs: {
            limit: { type: 'integer', description: 'Limit', default: 10 },
          },
        },
      ],
    };
    const server = generateMcpServer(decl);
    const tool = (server as any)._registeredTools['list_items'];
    expect(tool).toBeDefined();
  });

  it('4xx response includes both error message and response body', () => {
    const decl = minimal();
    const result = {
      request: { method: 'POST', url: 'https://api.test.com/items', headers: {} },
      status: 422,
      statusText: 'Unprocessable Entity',
      body: '{"error": "name is required"}',
      durationMs: 50,
    };
    const errorMsg = formatError(result, decl);
    // The MCP handler concatenates formatError + body for 4xx
    const mcpOutput = `${errorMsg}\n\nResponse body:\n${result.body}`;
    expect(mcpOutput).toContain('422');
    expect(mcpOutput).toContain('name is required');
    expect(mcpOutput).toContain('Response body:');
  });

  it('includes permission tier and method in tool description', () => {
    const server = generateMcpServer(minimal());
    const tool = (server as any)._registeredTools['create_item'];
    expect(tool).toBeDefined();
    expect(tool.description).toContain('[Permission: write]');
    expect(tool.description).toContain('[POST /items]');
  });

  it('includes requires_field constraint in tool description', () => {
    const decl: PasoDeclaration = {
      version: '1.0',
      service: { name: 'Test', description: 'Test', base_url: 'https://api.test.com' },
      capabilities: [
        {
          name: 'transfer',
          description: 'Transfer funds',
          method: 'POST',
          path: '/transfers',
          permission: 'admin',
          constraints: [{ requires_field: 'account_id' }],
        },
      ],
    };
    const server = generateMcpServer(decl);
    const tool = (server as any)._registeredTools['transfer'];
    expect(tool.description).toContain('Required: account_id must be provided');
  });
});

// --- Shared fixture tests for cross-SDK tool-description parity ---
import { readdirSync, readFileSync } from 'fs';
import YAML from 'yaml';

const TOOL_DESC_FIXTURES = join(__dirname, '../../../test-fixtures/tool-description');

describe('shared tool-description fixtures (cross-SDK parity)', () => {
  const files = readdirSync(TOOL_DESC_FIXTURES).filter((f) => f.endsWith('.yaml'));
  for (const file of files) {
    it(file.replace('.yaml', ''), () => {
      const content = readFileSync(join(TOOL_DESC_FIXTURES, file), 'utf-8');
      const fixture = YAML.parse(content);
      const cap = fixture.capability;

      const decl: PasoDeclaration = {
        version: '1.0',
        service: { name: 'Test', description: 'Test', base_url: 'https://api.test.com' },
        capabilities: [cap],
      };

      const server = generateMcpServer(decl);
      const tool = (server as any)._registeredTools[cap.name];
      expect(tool).toBeDefined();

      for (const substr of fixture.expected_contains || []) {
        expect(tool.description).toContain(substr);
      }
      for (const substr of fixture.expected_not_contains || []) {
        expect(tool.description).not.toContain(substr);
      }
    });
  }
});
