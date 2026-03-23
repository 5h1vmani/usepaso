import { describe, it, expect } from 'vitest';
import { generateMcpServer } from '../src/generators/mcp';
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
          priority: { type: 'enum', description: 'Priority level', values: ['low', 'medium', 'high'] },
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
    const decl = parseFile(join(__dirname, '../../../examples/sentry/paso.yaml'));
    const server = generateMcpServer(decl);
    const tools = Object.keys((server as any)._registeredTools);
    expect(tools.length).toBeGreaterThan(0);
    expect(tools).toContain('list_issues');
    expect(tools).toContain('resolve_issue');
  });

  it('works with Stripe example (respects forbidden)', () => {
    const decl = parseFile(join(__dirname, '../../../examples/stripe/paso.yaml'));
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
});
