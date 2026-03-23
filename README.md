# UsePaso

[![CI](https://github.com/5h1vmani/usepaso/actions/workflows/ci.yml/badge.svg)](https://github.com/5h1vmani/usepaso/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/usepaso)](https://www.npmjs.com/package/usepaso)
[![PyPI](https://img.shields.io/pypi/v/usepaso)](https://pypi.org/project/usepaso/)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

**Make your API agent-ready in minutes.**

One YAML declaration. Every agent protocol. Open source.

UsePaso is an SDK that lets any service declare what AI agents can do, with what permissions, under what constraints. Write a single `usepaso.yaml` file, and UsePaso generates a working MCP server (with A2A and more coming). No protocol expertise required.

## Quick Start

### Node.js

```bash
npm install usepaso
npx usepaso init --name "MyService"
# Edit usepaso.yaml to declare your capabilities
npx usepaso serve
```

### Python

```bash
pip install usepaso
usepaso init --name "MyService"
# Edit usepaso.yaml to declare your capabilities
usepaso serve
```

That's it. Your API is now agent-accessible via MCP.

### Programmatic Usage

```typescript
// Node.js
import { parseFile, validate, generateMcpServer } from 'usepaso';
```

```python
# Python — package name is "usepaso", import name is "paso"
from paso import parse_file, validate
```

## What You Write

A `usepaso.yaml` file that describes your API's capabilities:

```yaml
version: "1.0"

service:
  name: Sentry
  description: Error monitoring for software teams
  base_url: https://sentry.io/api/0
  auth:
    type: bearer

capabilities:
  - name: list_issues
    description: List issues in a project
    method: GET
    path: /projects/{org}/{project}/issues/
    permission: read
    inputs:
      org:
        type: string
        required: true
        description: Organization slug
        in: path
      project:
        type: string
        required: true
        description: Project slug
        in: path
      query:
        type: string
        description: "Search query (e.g., 'is:unresolved')"
        in: query

  - name: resolve_issue
    description: Mark an issue as resolved
    method: PUT
    path: /issues/{issue_id}/
    permission: write
    consent_required: true
    inputs:
      issue_id:
        type: string
        required: true
        description: The issue ID
        in: path
      status:
        type: enum
        required: true
        values: [resolved, unresolved, ignored]
        description: New status

permissions:
  read: [list_issues]
  write: [resolve_issue]
```

## What UsePaso Does With It

```
usepaso.yaml
    │
    ├──→ MCP server (Claude, Cursor, any MCP client)
    ├──→ A2A endpoint (coming soon)
    └──→ Registry entry (coming soon)
```

## CLI Commands

| Command            | What it does                                      |
| ------------------ | ------------------------------------------------- |
| `usepaso init`     | Create a usepaso.yaml template                    |
| `usepaso validate` | Check your declaration for errors                 |
| `usepaso inspect`  | Preview what MCP tools would be generated         |
| `usepaso test`     | Test a capability with a real HTTP request         |
| `usepaso serve`    | Start an MCP server from your declaration         |

### Options

```bash
usepaso init --name "MyService"                        # Scaffold a template
usepaso init --from-openapi ./openapi.json             # Generate from OpenAPI spec
usepaso init --from-openapi https://api.example.com/openapi.json  # From URL
usepaso validate -f ./my-api.yaml                      # Validate a specific file
usepaso inspect -f ./my-api.yaml                       # Preview tools
usepaso test list_issues -p org=acme -p project=web    # Test a capability live
usepaso test list_issues -p org=acme --dry-run          # Preview the HTTP request
usepaso serve -f ./my-api.yaml --verbose               # Serve with request logging
usepaso serve -f ./my-api.yaml --watch                 # Notify on file changes
```

## Authentication

Set the `USEPASO_AUTH_TOKEN` environment variable. UsePaso will include it in requests to your API based on the auth type in your declaration:

```bash
export USEPASO_AUTH_TOKEN="your-api-token"
usepaso serve
```

## Using With MCP Clients

### Claude Desktop

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "my-service": {
      "command": "npx",
      "args": ["usepaso", "serve", "-f", "/path/to/usepaso.yaml"],
      "env": {
        "USEPASO_AUTH_TOKEN": "your-token"
      }
    }
  }
}
```

### Cursor

Add to your Cursor MCP settings:

```json
{
  "my-service": {
    "command": "npx",
    "args": ["usepaso", "serve", "-f", "/path/to/usepaso.yaml"],
    "env": {
      "USEPASO_AUTH_TOKEN": "your-token"
    }
  }
}
```

## Examples

See the `examples/` directory for real-world declarations:

- **Sentry** — Error monitoring (6 capabilities)
- **Stripe** — Payments (6 capabilities)
- **Linear** — Issue tracking (6 capabilities)

## Spec Reference

See [spec/usepaso-spec.md](spec/usepaso-spec.md) for the full declaration format.

JSON Schema for editor autocomplete: [spec/usepaso.schema.json](spec/usepaso.schema.json)

## Project Structure

```
usepaso/
├── spec/                    # Capability declaration format spec + JSON Schema
├── examples/                # Real-world usepaso.yaml examples + init template
├── packages/
│   ├── paso-js/             # Node.js SDK (TypeScript)
│   └── paso-py/             # Python SDK
├── CONTRIBUTING.md          # How to contribute
├── AGENTS.md                # Instructions for AI coding agents
├── decisions.md             # Technical decision log
└── LICENSE                  # Apache 2.0
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and guidelines.

## License

Apache 2.0
