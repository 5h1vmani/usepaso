# UsePaso Examples

Real-world `usepaso.yaml` declarations for popular APIs. Each example is a working declaration you can validate, test, and serve immediately.

## Available Examples

| Service | Description | Auth | Capabilities |
|---------|------------|------|-------------|
| [Sentry](./sentry/) | Error monitoring and issue tracking | Bearer token | 6 |
| [Stripe](./stripe/) | Payment processing and billing | Bearer token | 6 |
| [Linear](./linear/) | Issue tracking and project management | Bearer token | 6 |
| [GitHub](./github/) | Code hosting, PRs, issues, Actions | Bearer token | 8 |
| [Slack](./slack/) | Team messaging and channels | Bearer token | 7 |
| [Twilio](./twilio/) | SMS, voice calls, phone numbers | Basic auth | 7 |
| [Template](./template/) | Starter template for new declarations | — | — |

## Quick Start

```bash
# Pick any example and validate it
usepaso validate -f examples/github/usepaso.yaml

# Test a capability (dry run — no real API call)
usepaso test -f examples/github/usepaso.yaml list_repos --dry-run

# Test for real (needs auth token)
export USEPASO_AUTH_TOKEN="your_token"
usepaso test -f examples/github/usepaso.yaml list_repos

# Start MCP server for agents
usepaso serve -f examples/github/usepaso.yaml
```

## Creating Your Own

```bash
# Start from the template
usepaso init

# Or generate from an existing OpenAPI spec
usepaso init --from-openapi ./your-openapi.json
```

See the [spec](../spec/usepaso-spec.md) for the full declaration format.
