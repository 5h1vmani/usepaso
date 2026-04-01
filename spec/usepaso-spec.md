# paso Capability Declaration Spec v1.0

## Overview

A paso declaration is a YAML file (`usepaso.yaml`) that describes what AI agents can do with a service's API. The SDK reads this file and generates protocol-specific outputs (MCP servers, A2A endpoints, etc.).

## File Format

The file MUST be named `usepaso.yaml` and placed in the project root (or specified via CLI flag).

## Schema

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | Yes | Spec version. Must be `"1.0"` |
| `service` | object | Yes | Service metadata |
| `capabilities` | array | Yes | List of agent-accessible actions |
| `permissions` | object | No | Permission tier assignments |

### `service` Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Human-readable service name |
| `description` | string | Yes | What the service does (used by agents for discovery) |
| `base_url` | string | Yes | Base URL of the API (e.g., `https://api.sentry.io`) |
| `version` | string | No | API version |
| `auth` | object | No | Authentication configuration |

### `service.auth` Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | One of: `api_key`, `bearer`, `oauth2`, `none` |
| `header` | string | No | Header name for api_key/bearer (default: `Authorization`) |
| `prefix` | string | No | Token prefix (e.g., `Bearer`, `Token`) |

### `capabilities[]` Array Items

Each capability represents one action an agent can take.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Machine-readable identifier (snake_case) |
| `description` | string | Yes | What this action does (agents read this to decide whether to call it) |
| `method` | string | Yes | HTTP method: `GET`, `POST`, `PUT`, `PATCH`, `DELETE` |
| `path` | string | Yes | API path, may include `{parameters}` |
| `permission` | string | Yes | One of: `read`, `write`, `admin` |
| `consent_required` | boolean | No | If true, agent must confirm with user before executing. Default: `false` |
| `inputs` | object | No | Parameters the agent sends |
| `output` | object | No | What the API returns |
| `constraints` | array | No | Business rules and limits |

### `capabilities[].inputs` Object

Keys are parameter names. Values describe the parameter.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | One of: `string`, `integer`, `number`, `boolean`, `enum`, `array`, `object` |
| `required` | boolean | No | Default: `false` |
| `description` | string | Yes | What this parameter does |
| `values` | array | No | Allowed values (required for `enum` type) |
| `default` | any | No | Default value |
| `in` | string | No | Where the param goes: `query`, `path`, `body`, `header`. Default: `body` for POST/PUT/PATCH, `query` for GET/DELETE |

### `capabilities[].output` Object

Keys are field names. Values describe the response field.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | One of: `string`, `integer`, `number`, `boolean`, `object`, `array` |
| `description` | string | No | What this field contains |

### `capabilities[].constraints[]` Array

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `max_per_hour` | integer | No | Rate limit per hour |
| `max_per_request` | integer | No | Max items per request (e.g., bulk operations) |
| `max_value` | number | No | Max numeric value (e.g., max transaction amount) |
| `allowed_values` | array | No | Restrict an input to specific values beyond its enum |
| `requires_field` | string | No | Another input that must be present |
| `description` | string | No | Human-readable rule explanation |

### `permissions` Object

Groups capabilities into permission tiers for easier agent authorization.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `read` | array | No | Capability names agents can call with read-only access |
| `write` | array | No | Capability names requiring write access |
| `admin` | array | No | Capability names requiring admin access |
| `forbidden` | array | No | Capability names agents may NEVER call |

If `permissions` is omitted, each capability's `permission` field is used directly.

## Validation Rules

These produce errors. A declaration with any error is invalid.

1. `version` must be `"1.0"`
2. `service.name` must be non-empty, max 100 characters
3. `service.description` must be non-empty, max 500 characters
4. `service.base_url` must be a valid URL, max 2000 characters
5. Each capability `name` must be unique
6. Each capability `name` must be snake_case (lowercase, underscores only), max 100 characters
7. Each capability `description` must be non-empty, max 500 characters
8. `method` must be a valid HTTP method
9. `path` must start with `/`
10. Parameters referenced in `path` (e.g., `{project_id}`) must exist in `inputs` with `in: path`
11. `enum` type inputs must have `values` defined
12. If `permissions` is defined, every capability name in `read`, `write`, or `admin` tiers must exist in `capabilities`. The `forbidden` tier may reference capability names not declared, to explicitly block API endpoints.
13. A capability cannot appear in both a permission tier and `forbidden`

## Validation Warnings

These do not make a declaration invalid but are reported by `usepaso validate` and `usepaso validate --strict`.

Always reported (with `usepaso validate`):
- `service.base_url` uses `http://` instead of `https://`. Auth tokens sent over plain HTTP are exposed in transit.
- `service.base_url` points to a private or internal IP address (e.g., `169.254.x.x`, `10.x.x.x`, `192.168.x.x`). Declarations are sometimes shared; a private address can be a security risk if the file is distributed.

Reported only with `--strict`:
- A `DELETE` capability has no `consent_required: true`. Agents could delete data without user confirmation.
- A `write` or `admin` capability has no `constraints`. Consider adding rate limits or guardrails.
- No `permissions` section defined. All capabilities are accessible by default.

## Example

```yaml
version: "1.0"

service:
  name: Sentry
  description: Error monitoring and performance tracking for software teams
  base_url: https://sentry.io/api/0
  auth:
    type: bearer

capabilities:
  - name: list_issues
    description: List issues (errors) in a project, filtered by status
    method: GET
    path: /projects/{organization_slug}/{project_slug}/issues/
    permission: read
    inputs:
      organization_slug:
        type: string
        required: true
        description: The organization slug
        in: path
      project_slug:
        type: string
        required: true
        description: The project slug
        in: path
      query:
        type: string
        description: Search query (e.g., "is:unresolved")
        in: query
    output:
      issues:
        type: array
        description: List of issue objects

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
        description: New status for the issue

permissions:
  read:
    - list_issues
  write:
    - resolve_issue
```
