# paso

One paso. Every protocol.

Make your API agent-ready in minutes, not weeks. Declare your capabilities once. UsePaso generates protocol-specific servers for MCP, A2A, and whatever comes next.

Self-hosted. Open source. No lock-in.

```bash
# That's it. Seriously.
$ npm install usepaso
$ npx usepaso init --name "Sentry"
  Created usepaso.yaml for "Sentry".

$ npx usepaso serve
  usepaso serving "Sentry" (6 capabilities). Agents welcome.
```

[![CI](https://github.com/5h1vmani/usepaso/actions/workflows/ci.yml/badge.svg)](https://github.com/5h1vmani/usepaso/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/usepaso)](https://www.npmjs.com/package/usepaso)
[![PyPI](https://img.shields.io/pypi/v/usepaso)](https://pypi.org/project/usepaso/)

## Quick Start

```bash
npm install usepaso
npx usepaso init --name "Sentry"
npx usepaso validate
npx usepaso serve
```

Python works the same way:

```bash
pip install usepaso
usepaso init --name "Sentry"
usepaso validate
usepaso serve
```

## What You Write

A `usepaso.yaml` file. It describes what agents can do with your API.

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
        in: path
      status:
        type: enum
        required: true
        values: [resolved, unresolved, ignored]

permissions:
  read: [list_issues]
  write: [resolve_issue]
```

## What UsePaso Does With It

```
usepaso.yaml
    │
    ├── MCP server    (Claude, Cursor, any MCP client)
    ├── A2A endpoint  (coming soon)
    └── Registry      (coming soon)
```

Each capability becomes an MCP tool. When an agent calls it, UsePaso makes the HTTP request to your API with proper auth, parameters, and error handling. You don't write protocol code. You don't learn MCP. You declare what your API can do, and UsePaso handles the rest.

## Already Have an OpenAPI Spec?

```bash
npx usepaso init --from-openapi ./openapi.json
```

UsePaso reads your spec and generates the declaration. Review it, adjust permissions, ship.

Works with URLs too:

```bash
npx usepaso init --from-openapi https://api.example.com/openapi.json
```

## CLI

| Command                       | What it does                             |
| ----------------------------- | ---------------------------------------- |
| `usepaso init`                | Scaffold a `usepaso.yaml` template       |
| `usepaso init --from-openapi` | Generate from an OpenAPI spec            |
| `usepaso validate`            | Check your declaration for errors        |
| `usepaso inspect`             | Preview what MCP tools will be generated |
| `usepaso test <capability>`   | Test a capability against the live API   |
| `usepaso test --dry-run`      | Same thing, minus the consequences       |
| `usepaso serve`               | Start an MCP server                      |
| `usepaso serve --verbose`     | Serve with request logging               |

## Authentication

Set `USEPASO_AUTH_TOKEN`. UsePaso includes it in requests based on the auth type in your declaration.

```bash
export USEPASO_AUTH_TOKEN="your-api-token"
usepaso serve
```

## Connect to MCP Clients

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sentry": {
      "command": "npx",
      "args": ["usepaso", "serve", "-f", "/path/to/usepaso.yaml"],
      "env": { "USEPASO_AUTH_TOKEN": "your-token" }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "sentry": {
    "command": "npx",
    "args": ["usepaso", "serve", "-f", "/path/to/usepaso.yaml"],
    "env": { "USEPASO_AUTH_TOKEN": "your-token" }
  }
}
```

## Examples

Real-world declarations in [`examples/`](examples/):

- **Sentry** — Error monitoring (6 capabilities)
- **Stripe** — Payments with constraints (6 capabilities)
- **GitHub** — Repository management (6 capabilities)
- **Slack** — Messaging (6 capabilities)
- **Twilio** — SMS and voice (6 capabilities)
- **Linear** — Issue tracking (6 capabilities)

## Programmatic Usage

```typescript
import { parseFile, validate, generateMcpServer } from "usepaso";
```

```python
# Package name is "usepaso", import name is "paso"
from paso import parse_file, validate
```

## Spec

Full declaration format: [spec/usepaso-spec.md](spec/usepaso-spec.md)

JSON Schema for editor autocomplete: [spec/usepaso.schema.json](spec/usepaso.schema.json)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache 2.0
