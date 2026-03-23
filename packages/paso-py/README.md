# UsePaso

[![CI](https://github.com/5h1vmani/usepaso/actions/workflows/ci.yml/badge.svg)](https://github.com/5h1vmani/usepaso/actions/workflows/ci.yml)
[![PyPI](https://img.shields.io/pypi/v/usepaso)](https://pypi.org/project/usepaso/)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](https://github.com/5h1vmani/usepaso/blob/main/LICENSE)

**Make your API agent-ready in minutes.** One YAML declaration, every agent protocol.

UsePaso lets any service declare what AI agents can do with their API. Write a `usepaso.yaml`, and UsePaso generates a working MCP server. No protocol expertise required.

## Install

```bash
pip install usepaso
```

## Quick Start

```bash
# Scaffold a declaration
usepaso init --name "MyService"

# Or generate from an existing OpenAPI spec
usepaso init --from-openapi ./openapi.json

# Validate
usepaso validate

# Preview what MCP tools will be generated
usepaso inspect

# Test a capability
usepaso test list_issues -p org=acme -p project=web --dry-run

# Start the MCP server
usepaso serve
```

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

```
usepaso.yaml → MCP server (Claude, Cursor, any MCP client)
```

Each capability becomes an MCP tool. When an agent calls a tool, UsePaso makes the real HTTP request to your API with proper auth, parameters, and error handling.

## CLI Commands

| Command | What it does |
|---------|-------------|
| `usepaso init` | Scaffold a `usepaso.yaml` template |
| `usepaso init --from-openapi` | Generate from OpenAPI spec (file or URL) |
| `usepaso validate` | Check your declaration for errors |
| `usepaso inspect` | Preview MCP tools that will be generated |
| `usepaso test <capability>` | Test a capability with a real HTTP request |
| `usepaso test <cap> --dry-run` | Preview the HTTP request without executing |
| `usepaso serve` | Start an MCP server (stdio transport) |
| `usepaso serve --verbose` | Serve with request logging |

## Programmatic Usage

```python
# Package name is "usepaso", import name is "paso"
from paso import parse_file, validate

decl = parse_file('usepaso.yaml')
errors = validate(decl)
```

## Connect to MCP Clients

### Claude Desktop

```json
{
  "mcpServers": {
    "my-service": {
      "command": "usepaso",
      "args": ["serve", "-f", "/path/to/usepaso.yaml"],
      "env": { "USEPASO_AUTH_TOKEN": "your-token" }
    }
  }
}
```

## Links

- [Full documentation](https://github.com/5h1vmani/usepaso)
- [Spec reference](https://github.com/5h1vmani/usepaso/blob/main/spec/usepaso-spec.md)
- [Examples](https://github.com/5h1vmani/usepaso/tree/main/examples)
- [Node.js SDK](https://www.npmjs.com/package/usepaso)

## License

Apache 2.0
