# GitHub — UsePaso Example

Makes the GitHub REST API agent-ready. Exposes repos, issues, PRs, comments, and Actions workflows.

## Capabilities

| Capability         | Method | Permission | Description                                  |
| ------------------ | ------ | ---------- | -------------------------------------------- |
| list_repos         | GET    | read       | List authenticated user's repositories       |
| get_repo           | GET    | read       | Get repository details                       |
| list_issues        | GET    | read       | List issues with state/label filters         |
| create_issue       | POST   | write      | Create a new issue (consent required)        |
| list_pull_requests | GET    | read       | List pull requests                           |
| create_comment     | POST   | write      | Comment on an issue or PR (consent required) |
| list_workflows     | GET    | read       | List GitHub Actions workflows                |
| delete_repo        | DELETE | admin      | Delete a repository (consent required)       |

## Setup

1. Create a personal access token at https://github.com/settings/tokens
2. Select scopes: `repo`, `read:org`

```bash
export USEPASO_AUTH_TOKEN="ghp_your_token_here"
```

## Run

```bash
# Validate the declaration
usepaso validate -f examples/github/usepaso.yaml

# Test a capability
usepaso test -f examples/github/usepaso.yaml list_repos

# Start MCP server
usepaso serve -f examples/github/usepaso.yaml
```
