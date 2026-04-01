# paso

The agent-readiness toolkit for APIs.

Declare your API's capabilities once. paso generates the MCP server. No protocol code required.

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

## What paso Does With It

Each capability becomes an MCP tool. When an agent calls it, paso makes the HTTP request to your API with proper auth, parameters, and error handling.

## CLI

| Command | What it does |
|---------|-------------|
| `usepaso init` | Scaffold a `usepaso.yaml` template (JSONPlaceholder example) |
| `usepaso init --blank` | Scaffold a blank template |
| `usepaso init --from-openapi` | Generate from an OpenAPI spec |
| `usepaso validate` | Check your declaration for errors |
| `usepaso validate --strict` | Check for best practices (missing constraints, consent) |
| `usepaso inspect` | Preview MCP tools that will be generated |
| `usepaso test <capability>` | Test a capability against the live API |
| `usepaso test --dry-run` | Same thing, minus the consequences |
| `usepaso test --all --dry-run` | Verify all capabilities resolve correctly |
| `usepaso serve` | Start an MCP server (stdio) |
| `usepaso serve --strict` | Serve with consent gates enforced (two-phase confirmation) |
| `usepaso serve --verbose` | Serve with request logging |
| `usepaso connect <client>` | Wire this server into an MCP client config (claude-desktop, cursor, vscode, windsurf) |
| `usepaso disconnect <client>` | Remove from an MCP client config |
| `usepaso doctor` | Check your setup end-to-end |
| `usepaso completion` | Output shell completion script (bash, zsh, fish) |
| `usepaso version` | Print the version |

## Programmatic Usage

```typescript
import { parseFile, validate, generateMcpServer } from 'usepaso';

const decl = parseFile('usepaso.yaml');
const errors = validate(decl);
const { server, toolNames } = generateMcpServer(decl);
```

## Connect to MCP Clients

```bash
npx usepaso connect claude-desktop
npx usepaso connect cursor
npx usepaso connect vscode
npx usepaso connect windsurf
```

Or add manually to your client config:

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

- [Documentation](https://usepaso.dev/docs/getting-started/)
- [Blog](https://usepaso.dev/blog/)
- [Changelog](https://usepaso.dev/changelog/)
- [Spec reference](https://github.com/5h1vmani/usepaso/blob/main/spec/usepaso-spec.md)
- [Examples](https://github.com/5h1vmani/usepaso/tree/main/examples)
- [Python SDK](https://pypi.org/project/usepaso/)

## License

Apache 2.0
