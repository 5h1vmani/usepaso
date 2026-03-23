# Twilio — UsePaso Example

Makes the Twilio REST API agent-ready. Exposes SMS, voice calls, phone numbers, and usage records.

## Capabilities

| Capability | Method | Permission | Description |
|-----------|--------|------------|-------------|
| send_sms | POST | write | Send an SMS message (consent required) |
| list_messages | GET | read | List sent and received messages |
| get_message | GET | read | Get message details by SID |
| make_call | POST | write | Initiate an outbound call (consent required) |
| list_calls | GET | read | List call logs |
| list_phone_numbers | GET | read | List account phone numbers |
| get_usage | GET | read | Get usage records for billing |

## Setup

Twilio uses Basic auth (Account SID + Auth Token).

1. Find your credentials at https://console.twilio.com/
2. The `base_url` contains `{account_sid}` — replace it or set it as an environment variable

```bash
export USEPASO_AUTH_TOKEN="your_account_sid:your_auth_token"
```

Note: For Basic auth, the token format is `username:password` separated by a colon.

## Run

```bash
# Validate the declaration
usepaso validate -f examples/twilio/usepaso.yaml

# Test a capability
usepaso test -f examples/twilio/usepaso.yaml list_messages

# Start MCP server
usepaso serve -f examples/twilio/usepaso.yaml
```
