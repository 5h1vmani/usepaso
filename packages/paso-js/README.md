# usepaso

One paso. Every protocol.

Declare your API's agent capabilities once. UsePaso generates the MCP server. No protocol expertise required.

Self-hosted. Open source. Apache 2.0.

[![CI](https://github.com/5h1vmani/usepaso/actions/workflows/ci.yml/badge.svg)](https://github.com/5h1vmani/usepaso/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/usepaso)](https://www.npmjs.com/package/usepaso)

## Install

```bash
npm install usepaso
```

## Quick Start

```bash
# Scaffold a declaration
npx usepaso init --name "MyService"

# Or generate from an existing OpenAPI spec
npx usepaso init --from-openapi ./openapi.json

# Check it
npx usepaso validate

# Preview what MCP tools will be generated
npx usepaso inspect

# Test a capability (without the consequences)
npx usepaso test list_issues -p org=acme -p project=web --dry-run

# Start the MCP server
npx usepaso serve
```

That's it. Your API is agent-ready.

## What You Write

```yaml
# usepaso.yaml
version: "1.0"

service:
  name: MyService
  description: My API service
  base_url: https://api.example.com
  auth:
    type: bearer

capabilities:
  - name: list_items
    description: List all items
    method: GET
    path: /items
    permission: read

  - name: create_item
    description: Create a new item
    method: POST
    path: /items
    permission: write
    consent_required: true
    inputs:
      name:
        type: string
        required: true
        description: Item name
```

## What UsePaso Does With It

Each capability becomes an MCP tool. When an agent calls it, UsePaso makes the HTTP request to your API with proper auth, parameters, and error handling.

## CLI

| Command | What it does |
|---------|-------------|
| `usepaso init` | Scaffold a `usepaso.yaml` template |
| `usepaso init --from-openapi` | Generate from an OpenAPI spec |
| `usepaso validate` | Check your declaration for errors |
| `usepaso inspect` | Preview MCP tools that will be generated |
| `usepaso test <capability>` | Test a capability against the live API |
| `usepaso test --dry-run` | Same thing, minus the consequences |
| `usepaso serve` | Start an MCP server (stdio) |
| `usepaso serve --verbose` | Serve with request logging |

## Programmatic Usage

```typescript
import { parseFile, validate, generateMcpServer } from 'usepaso';

const decl = parseFile('usepaso.yaml');
const errors = validate(decl);
const server = generateMcpServer(decl);
```

## Connect to Claude Desktop

```json
{
  "mcpServers": {
    "my-service": {
      "command": "npx",
      "args": ["usepaso", "serve", "-f", "/path/to/usepaso.yaml"],
      "env": { "USEPASO_AUTH_TOKEN": "your-token" }
    }
  }
}
```

## Links

- [Full documentation](https://github.com/5h1vmani/usepaso)
- [Spec reference](https://github.com/5h1vmani/usepaso/blob/main/spec/usepaso-spec.md)
- [Examples](https://github.com/5h1vmani/usepaso/tree/main/examples)
- [Python SDK](https://pypi.org/project/usepaso/)

## License

Apache 2.0
