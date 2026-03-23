# Linear — UsePaso Example

Makes the Linear API agent-ready. Exposes issues, teams, comments, and status management via Linear's GraphQL API.

## Capabilities

| Capability | Method | Permission | Description |
|-----------|--------|------------|-------------|
| list_issues | POST | read | List issues filtered by team, status, or assignee |
| get_issue | POST | read | Get issue details by identifier (e.g., ENG-123) |
| create_issue | POST | write | Create a new issue (consent required) |
| update_issue_status | POST | write | Change issue status (consent required) |
| add_comment | POST | write | Add a comment to an issue |
| list_teams | POST | read | List all teams in the workspace |

Note: Linear uses a GraphQL API, so all capabilities use POST to `/graphql`.

## Setup

1. Create a personal API key at https://linear.app/settings/api
2. Or create an OAuth app for broader access

```bash
export USEPASO_AUTH_TOKEN="lin_api_your_key_here"
```

## Run

```bash
usepaso validate -f examples/linear/usepaso.yaml
usepaso test -f examples/linear/usepaso.yaml list_teams
usepaso serve -f examples/linear/usepaso.yaml
```
