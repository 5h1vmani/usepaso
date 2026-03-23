# Slack — UsePaso Example

Makes the Slack Web API agent-ready. Exposes channels, messages, reactions, search, and user info.

## Capabilities

| Capability | Method | Permission | Description |
|-----------|--------|------------|-------------|
| list_channels | GET | read | List public channels in the workspace |
| send_message | POST | write | Send a message to a channel or DM (consent required) |
| get_channel_history | GET | read | Fetch recent messages from a channel |
| add_reaction | POST | write | Add an emoji reaction (consent required) |
| search_messages | GET | read | Search messages across the workspace |
| get_user_info | GET | read | Get user profile information |
| delete_message | POST | admin | Delete a message (consent required) |

## Setup

1. Create a Slack app at https://api.slack.com/apps
2. Add OAuth scopes: `channels:read`, `chat:write`, `reactions:write`, `search:read`, `users:read`, `channels:history`
3. Install to workspace and copy the Bot User OAuth Token

```bash
export USEPASO_AUTH_TOKEN="xoxb-your-token-here"
```

## Run

```bash
# Validate the declaration
usepaso validate -f examples/slack/usepaso.yaml

# Test a capability
usepaso test -f examples/slack/usepaso.yaml list_channels

# Start MCP server
usepaso serve -f examples/slack/usepaso.yaml
```
