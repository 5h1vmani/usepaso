# Sentry — UsePaso Example

Makes the Sentry API agent-ready. Exposes issue tracking, project listing, and issue management.

## Capabilities

| Capability | Method | Permission | Description |
|-----------|--------|------------|-------------|
| list_issues | GET | read | List issues filtered by status or search query |
| get_issue | GET | read | Get details of a specific issue |
| resolve_issue | PUT | write | Mark an issue as resolved (consent required) |
| assign_issue | PUT | write | Assign an issue to a team member (consent required) |
| list_projects | GET | read | List all projects in an organization |
| delete_issue | DELETE | admin | Permanently delete an issue (consent required) |

## Setup

1. Create an auth token at https://sentry.io/settings/account/api/auth-tokens/
2. Select scopes: `project:read`, `event:read`, `event:write`, `event:admin`

```bash
export USEPASO_AUTH_TOKEN="sntrys_your_token_here"
```

## Run

```bash
usepaso validate -f examples/sentry/usepaso.yaml
usepaso test -f examples/sentry/usepaso.yaml list_issues --params '{"organization_slug":"my-org","project_slug":"my-project"}'
usepaso serve -f examples/sentry/usepaso.yaml
```
