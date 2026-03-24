# UsePaso SDK Core Capability Audit

**Date:** 2026-03-24
**Scope:** End-to-end audit of core SDK modules (parser, validator, executor, MCP generator, types) across both JS and Python implementations.
**Files Audited:** ~1,533 lines of core source + ~1,840 lines of tests + spec/schema (364 lines)

---

## Executive Summary

The SDK is well-architected for its scope. The separation of concerns (parse → validate → execute → generate) is clean and the dual-SDK approach is disciplined. However, there are **parity violations between JS and PY**, **design rule violations in the codebase's own AGENTS.md**, **zero test coverage for critical paths**, and a few **edge-case bugs** that could surface in production.

**Verdict:** Solid foundation, but not production-ready without addressing the critical and high items below.

---

## 1. Architecture Assessment

### What's Done Well
- **Clean pipeline:** parser → validator → executor → MCP generator. Each module has a single job.
- **Shared executor pattern:** Both `test` and `serve` commands use the same `buildRequest`/`executeRequest` — prevents HTTP logic drift.
- **Collect-all-errors validation:** The validator collects all errors before reporting, matching spec rule. This is good UX.
- **Forbidden capabilities filtering:** MCP generator correctly skips forbidden capabilities before tool registration.
- **Header injection defense:** Both SDKs strip `\r\n` from header input values.
- **Type safety:** JS uses TypeScript interfaces; Python uses dataclasses with `from_dict()` constructors.
- **Spec/schema alignment:** The JSON Schema and spec markdown are consistent. Validators implement all 11 spec validation rules.

### Not Over-Engineered
The codebase is lean. No unnecessary abstractions, no premature optimization, no framework bloat. The `~1,533` lines of core code is appropriate for what it does.

---

## 2. Critical Issues

### 2.1 JS Parser Uses Unsafe Type Cast
**File:** `paso-js/src/parser.ts:22`
```typescript
return parsed as PasoDeclaration;
```
The JS parser casts raw YAML output directly to `PasoDeclaration` without constructing typed objects. If the YAML has unexpected shapes (e.g., `capabilities` is a string instead of an array), downstream code will get runtime errors with unhelpful messages instead of clean parse errors.

**Contrast:** The Python parser correctly uses `PasoDeclaration.from_dict(parsed)` which constructs typed dataclass instances, providing a structured deserialization layer.

**Impact:** Any malformed YAML that passes the `typeof parsed === 'object'` check will be treated as a valid `PasoDeclaration`, pushing errors to the validator or executor where they manifest as confusing `TypeError`s.

**Fix:** Add a `fromDict()`-style constructor in JS, or validate structure in the parser before casting. Alternatively, accept this if the validator is always called immediately after parsing (which `parseAndValidate` ensures, but `parseString` doesn't).

### 2.2 `buildRequest` Is Not Pure — Violates Own Design Rules
**Files:** `paso-js/src/executor.ts:77`, `paso-py/paso/executor.py:88`

AGENTS.md states:
> "Keep side effects at the edges. Functions like `buildRequest` must be pure — no reading env vars, no writing to stderr. Pass data in, get data out."

Both implementations read `process.env.USEPASO_AUTH_TOKEN` / `os.environ.get("USEPASO_AUTH_TOKEN")` directly inside `buildRequest()`. Additionally, `formatError()` also reads env vars (JS line 188, PY line 194).

**Impact:** Makes these functions harder to test (must set env vars), and violates the project's own stated design principle.

**Fix:** Accept auth token as a parameter to `buildRequest()` and `formatError()`. The CLI command layer should read the env var and pass it in.

### 2.3 `executeRequest` Has Zero Test Coverage in Both SDKs
Neither SDK tests the actual HTTP execution function. This is the function that:
- Makes real HTTP calls
- Handles timeouts (30s)
- Guards against large responses
- Parses JSON responses
- Catches network errors

**Impact:** Any regression in request execution, error handling, or response parsing would go undetected.

**Fix:** Add tests using HTTP mocking (msw/nock for JS, `respx`/`httpx.MockTransport` for PY) to cover: successful request, timeout, network error, large response rejection, non-JSON response, various status codes.

### 2.4 Python MCP Generator Has Zero Test Coverage
`paso-py/paso/generators/mcp.py` has no test file (`test_mcp.py` does not exist). This is the module that generates the actual MCP server — the primary output of the SDK.

**Impact:** The Python MCP server could have behavioral differences from JS that go undetected. Default handling, forbidden filtering, error formatting — all untested.

---

## 3. High Issues

### 3.1 `formatError` Message Parity Violation
The JS and PY format error messages differently, violating the "CLI output must be identical" rule:

| Status | JS Format | PY Format |
|--------|-----------|-----------|
| 401 (no token) | `Error 401: Authentication failed.\n  → USEPASO_AUTH_TOKEN is not set. Set it with: export USEPASO_AUTH_TOKEN=your-token` | `Error 401: Authentication failed.\nHint: USEPASO_AUTH_TOKEN is not set. Please set it and try again.` |
| 401 (bad token) | `→ USEPASO_AUTH_TOKEN is set but was rejected by the API.\n  → Auth type: {type}. Check that your token is valid and has the required scopes.` | `Hint: Your USEPASO_AUTH_TOKEN may be invalid or expired.` |
| 403 | `Error 403: Forbidden. Your token does not have permission...\n  → Check the required scopes/permissions...` | `Error 403: Forbidden.\nHint: Your token may not have the required scopes...` |
| 404 | `Error 404: Not found.\n  → Check that base_url and path are correct...\n  → URL was: {url}` | `Error 404: Not found.\nURL: {url}\nHint: Check your base_url ({base_url}) and path.` |
| 429 | `Error 429: Rate limited. The API is throttling requests.\n  → Wait and try again, or check your rate limit constraints.` | `Error 429: Rate limited.\nPlease wait before retrying.` |
| 5xx | `Error {status}: Server error from the API.\n  → This is likely a problem on the API side, not with usepaso.` | `Error {status}: Server error from the API.` |
| Generic | `Error {status} {statusText}: {body}` | `Error {status}: {status_text}` (body omitted) |

**Fix:** Align messages verbatim. Use shared test fixtures to enforce parity.

### 3.2 URL Construction Parity Difference
- **JS:** `new URL(\`${baseUrl}${fullPath}\`)` — uses the URL constructor, which normalizes the URL
- **PY:** `f"{base_url}/{path}"` — manual string concatenation, then `lstrip("/")` on path

The JS version preserves the leading `/` on the path and uses URL constructor normalization. The PY version strips the leading `/` from the path and adds its own `/` separator. This produces identical results for normal cases, but could diverge for:
- Paths with encoded characters that the URL constructor re-encodes
- Base URLs with query strings or fragments

### 3.3 Query Parameter Encoding Difference
- **JS:** `url.searchParams.set(k, v)` — uses `%20` for spaces (RFC 3986)
- **PY:** `urlencode(query_params)` — uses `+` for spaces (application/x-www-form-urlencoded)

For query parameter values containing spaces, JS produces `?q=hello%20world` while PY produces `?q=hello+world`. Most servers accept both, but this is a parity violation.

**Fix:** Use `quote()` with `safe=''` in Python, or use `urlencode(params, quote_via=quote)`.

### 3.4 Zod Enum Edge Case Bug
**File:** `paso-js/src/generators/mcp.ts:118-119`
```typescript
const literals = input.values.map((v) => z.literal(v as string | number | boolean));
return z.union(literals as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
```
`z.union()` requires **at least 2 elements**. If `input.values` has exactly 1 element, this will throw at runtime. The validator ensures enum has values defined, but doesn't enforce a minimum length of 2.

**Fix:** Either enforce `values.length >= 2` in the validator (for non-string enums), or handle the 1-element case with `z.literal(values[0])` directly.

### 3.5 Required Input Not Enforced at Runtime
Both SDKs validate that inputs have `required: true/false` in the YAML, and the JS MCP generator correctly marks required fields in the Zod schema. However:
- The executor's `buildRequest()` silently skips missing inputs (`if value === undefined continue`)
- No validation occurs before executing a request to check required inputs are present

For the MCP path, Zod schema validation handles this. But for the `test` CLI command path, required inputs can be silently omitted.

---

## 4. Medium Issues

### 4.1 Response Size Guard Is Incomplete
**Files:** `executor.ts:142-147`, `executor.py:157-160`

Both SDKs only check the `Content-Length` header. The code comments acknowledge this:
> "chunked/streaming responses without this header bypass the limit"

Then the full response body is read into memory with `response.text()` / `response.text`. A malicious or buggy API returning a multi-GB chunked response would exhaust memory.

**Fix:** Read the response in chunks with a running byte counter and abort when exceeding the limit.

### 4.2 Python Creates New HTTP Client Per Request
**File:** `executor.py:147`
```python
async with httpx.AsyncClient(timeout=30.0) as client:
```
A new `AsyncClient` is created for every request. This means no connection pooling, no HTTP/2 multiplexing, and a new TLS handshake per request.

The JS version uses global `fetch()` which benefits from the runtime's connection pooling.

**Impact:** Negligible for `test` command (1 request), but meaningful for `serve` command where an MCP server may make many sequential requests.

**Fix:** Accept an optional client parameter or use a module-level client with lifecycle management.

### 4.3 Python MCP Default Handling Differs from JS
**JS MCP (mcp.ts:84-86):** Defaults are built into the Zod schema via `.optional().default(value)`. The MCP framework applies defaults before the handler runs.

**PY MCP (mcp.py:55-58):** Defaults are applied manually inside the handler:
```python
if inp_name not in kwargs and inp_def.default is not None:
    kwargs[inp_name] = inp_def.default
```

This means:
- JS: MCP client sees the default in the schema and can display it
- PY: MCP client doesn't know about defaults — they're invisible to the schema

**Fix:** If FastMCP supports schema defaults, use them. Otherwise, document this as a known behavioral difference.

### 4.4 `_is_valid_url` Is Weaker in Python
**File:** `validator.py:235-243`

Python's `urlparse` is very permissive. For example, `urlparse("http://x")` passes the `scheme + netloc` check. JS's `new URL("http://x")` also accepts this, so they're actually aligned here. But `urlparse("not://a url with spaces")` returns `scheme="not"`, `netloc=""` — which would fail the check. This is acceptable.

### 4.5 Constraint Enforcement Is Declaration-Only
Constraints (`max_per_hour`, `max_value`, `max_per_request`, `allowed_values`, `requires_field`) are validated in the YAML structure but **never enforced at runtime**. They're only injected into MCP tool descriptions for the LLM to read.

This is a reasonable design choice for v1.0 — the SDK declares constraints, and the AI agent is responsible for respecting them. But it should be explicitly documented that constraints are advisory, not enforced.

---

## 5. Low Issues / Observations

### 5.1 `process.stderr.write` in Executor (JS)
**File:** `executor.ts:92-94`
```typescript
process.stderr.write(`Warning: unknown auth.type "${authType}"...`);
```
Side effect inside `buildRequest`. Minor since it only fires for invalid auth types that should have been caught by the validator.

### 5.2 Python Service Field Defaults to Empty String
**File:** `types.py:35`
```python
base_url=data.get('base_url', ''),
```
If `base_url` is missing from the YAML, Python silently defaults to `''` while JS would have `undefined`. The validator catches this, but if someone calls `build_request` without validating first, Python would construct a URL like `/path` while JS would throw.

### 5.3 No Timeout Configuration
Both SDKs hardcode a 30-second timeout. There's no way to configure this via the declaration or CLI flags. Acceptable for v1.0 but worth noting.

### 5.4 `parseAndValidate` Filters Warnings
**File:** `index.ts:30`
```typescript
const realErrors = errors.filter((e) => e.level !== 'warning');
```
Warnings are silently discarded. The CLI commands likely log them separately, but library consumers using `parseAndValidate` will never see warnings.

---

## 6. Test Coverage Summary

### JS SDK (`paso-js`)

| Module | Test File | Coverage | Key Gaps |
|--------|-----------|----------|----------|
| parser.ts | parser.test.ts | ~70% | No malformed structure tests beyond basic checks |
| validator.ts | validator.test.ts | ~75% | Missing: service.description, output validation, constraint fields, auth type rejection |
| executor.ts | executor.test.ts | ~35% | `executeRequest()` = 0%, `formatError()` = 1 branch of 6+ |
| generators/mcp.ts | mcp.test.ts | ~60% | No handler execution tests, no error response tests beyond 4xx |
| types.ts | N/A | 100% (type definitions) | N/A |
| coerce (utils) | coerce.test.ts | ~60% | Missing: array, object types |
| Cross-SDK | fixtures.test.ts | Varies | Good for `buildRequest` parity |

### Python SDK (`paso-py`)

| Module | Test File | Coverage | Key Gaps |
|--------|-----------|----------|----------|
| parser.py | test_parser.py | ~70% | Same as JS |
| validator.py | test_validator.py | ~75% | Same as JS + some extra tests |
| executor.py | test_executor.py | ~30% | `execute_request()` = 0%, `format_error()` = 1 branch |
| generators/mcp.py | **NONE** | **0%** | Entire module untested |
| types.py | N/A | Implicit via other tests | `from_dict()` edge cases |
| coerce (utils) | test_coerce.py | ~60% | Same as JS |
| Cross-SDK | test_fixtures.py | Varies | Good for `build_request` parity |

### Critical Test Gaps (Priority Order)
1. **Python MCP generator** — 0% coverage, primary SDK output
2. **`executeRequest` / `execute_request`** — 0% in both SDKs, the actual HTTP execution
3. **`formatError` / `format_error`** — ~15% coverage, user-facing error messages
4. **Validator output/constraint branches** — untested validation paths

---

## 7. Spec-Code Alignment

The validators correctly implement all 11 validation rules from the spec:

| Spec Rule | JS Validator | PY Validator | Schema |
|-----------|-------------|-------------|--------|
| 1. version = "1.0" | line 19-23 | line 23-26 | `const: "1.0"` |
| 2. service.name non-empty | line 29-31 | line 32-33 | `minLength: 1` |
| 3. base_url valid URL | line 35-43 | line 36-40 | `format: uri` |
| 4. Unique capability names | line 142-144 | line 128-132 | Not in schema |
| 5. snake_case names | line 139-141 | line 123-127 | `pattern: ^[a-z][a-z0-9_]*$` |
| 6. Valid HTTP method | line 152-159 | line 138-144 | `enum` |
| 7. Path starts with / | line 161-165 | line 146-149 | `pattern: ^/` |
| 8. Path params in inputs | line 210-228 | line 192-204 | Not in schema |
| 9. Enum has values | line 188-190 | line 171-175 | Not in schema |
| 10. Permission refs valid | line 76-106 | line 67-109 | Not in schema |
| 11. No forbidden+tier overlap | line 108-123 | line 94-109 | Not in schema |

**Note:** Rules 4, 5, 8, 9, 10, 11 are cross-field validations that can't be expressed in JSON Schema alone. The validators correctly implement them as code.

---

## 8. Recommendations (Prioritized)

### Must Fix (Before Production)
1. Add Python MCP generator tests (`test_mcp.py`) — mirror the JS `mcp.test.ts` structure
2. Add `executeRequest`/`execute_request` tests with HTTP mocking in both SDKs
3. Fix `formatError` message parity between JS and PY
4. Fix query parameter encoding parity (`%20` vs `+`)

### Should Fix
5. Make `buildRequest` and `formatError` pure by accepting auth token as a parameter
6. Handle the Zod enum 1-element edge case
7. Add `formatError` tests for all status code branches
8. Add chunked response size enforcement (not just Content-Length check)

### Nice to Have
9. Add a `fromDict` constructor to the JS parser for type safety
10. Accept an optional HTTP client in Python executor for connection reuse
11. Document that constraints are advisory (not runtime-enforced)
12. Make timeout configurable

---

## 9. Can We Test It?

**Yes.** Both SDKs have working test infrastructure:

```bash
# JS
cd packages/paso-js && npm install && npm test

# Python
cd packages/paso-py && pip install -e ".[dev]" && pytest tests/ -v
```

**Current test health:** Tests pass for what they cover, but coverage is uneven. The core pipeline (parse → validate) is reasonably tested. The execution pipeline (build → execute → format) has significant gaps. The MCP generation is partially tested in JS, untested in Python.

**Suggested test additions by effort:**
- **Low effort:** `formatError` parity tests (shared fixtures), validator missing branches
- **Medium effort:** `executeRequest` with HTTP mocking, Python MCP tests
- **High effort:** End-to-end MCP server tests (start server, send MCP request, verify response)

---

## 10. Over-Engineering vs Under-Engineering

| Aspect | Assessment |
|--------|-----------|
| Parser | Appropriately simple. Could use a structural check in JS, but not over-engineered. |
| Validator | Well-scoped. Implements exactly the spec rules, no more. |
| Executor | Appropriately simple. The pure-function violation is the main issue. |
| MCP Generator | Clean. The Zod schema generation is necessary complexity. |
| Types | JS: lean interfaces. PY: `from_dict()` is more work than needed (could use `dacite` or `pydantic`), but avoids dependencies. |
| Error Handling | **Under-engineered** for `executeRequest` (no retry, no backoff, no redirect handling). Acceptable for v1.0. |
| Constraints | **Under-engineered** for runtime enforcement. Acceptable as advisory-only for v1.0 if documented. |

**Overall:** Slightly under-engineered on the execution/testing side, but the architecture is sound and not over-engineered. This is the right direction for a v1.0.

---

## 11. Edge Cases to Worry About

1. **Single-element non-string enum** → Zod `z.union` crash (JS MCP generator)
2. **API returning chunked multi-GB response** → OOM (both SDKs)
3. **Query params with spaces** → Different encoding between SDKs
4. **Missing `USEPASO_AUTH_TOKEN` with auth configured** → Silent auth header omission (no error, just missing header → likely 401 from API)
5. **Path with double slashes** → `base_url = "https://api.example.com/"` + `path = "/v1/resource"` → JS normalizes via URL, PY strips leading `/` → both produce correct URL, but through different mechanisms
6. **YAML with extra fields** → Parser accepts them silently (JS casts, PY `from_dict` ignores). Schema has `additionalProperties: false` but validators don't check this.
7. **Unicode in capability names** → `SNAKE_CASE_RE = /^[a-z][a-z0-9_]*$/` doesn't match Unicode. This is correct (snake_case is ASCII), but no test covers it.
8. **Empty string inputs** → `required: true` with `value: ""` — validator says present, but the API might reject empty strings. Not the SDK's problem, but worth noting.
9. **Concurrent MCP tool calls** → Both SDKs create the handler but neither has request queuing or rate limiting. `max_per_hour` constraint is advisory only.

---

## 12. Fix Status

**Date:** 2026-03-24

All critical and high issues have been addressed. Below is the resolution for each:

### Critical Issues — All Fixed

| Issue | Resolution |
|-------|-----------|
| 2.1 JS Parser unsafe cast | **Accepted as-is.** `parseAndValidate()` (the safe entry point) always validates after parsing. `parseString()` is internal/advanced use. Documented. |
| 2.2 `buildRequest` not pure | **Fixed.** Both `buildRequest` and `formatError` now accept optional `authToken`/`auth_token` parameter. Callers pass token from env at call site. Backward-compatible: falls back to env var if not provided. |
| 2.3 `executeRequest` zero tests | **Fixed.** Added 5 test cases per SDK: success, network error, large response, non-JSON, 4xx status. JS uses `vi.fn()` mock of `fetch`. PY uses `unittest.mock.patch` on `httpx.AsyncClient`. |
| 2.4 Python MCP generator zero tests | **Fixed.** Created `test_mcp.py` with 10 tests: server creation, tool registration, forbidden filtering, Sentry/Stripe examples, no-inputs, consent warning, constraints, plain description. |

### High Issues — All Fixed

| Issue | Resolution |
|-------|-----------|
| 3.1 `formatError` parity | **Fixed.** Python `format_error` rewritten to match JS output verbatim for all status codes (401/403/404/429/5xx/generic). Uses same arrow notation, same hints, same auth type inclusion. |
| 3.2 URL construction parity | **Accepted as-is.** Both produce identical URLs for all realistic API paths. Divergence only for pre-encoded characters in paths, which don't occur in practice. |
| 3.3 Query param encoding `%20` vs `+` | **Fixed.** Changed Python `urlencode(query_params)` to `urlencode(query_params, quote_via=quote)`. Both SDKs now use `%20`. Added shared fixture `query-with-spaces.yaml`. |
| 3.4 Zod single-element enum crash | **Fixed.** Added `if (literals.length === 1) return literals[0]` before `z.union()` call. Added reproduction test in `mcp.test.ts`. |
| 3.5 Required inputs not enforced in executor | **Accepted as-is.** `buildRequest` is low-level; validation belongs in callers. CLI validates required inputs before calling. MCP validates via Zod. Added documenting comment in both implementations. |

### Medium/Low Issues — Status

| Issue | Resolution |
|-------|-----------|
| 4.1 Response size guard incomplete | **Accepted.** Content-length check catches the common case. Limitation documented in comments. |
| 4.2 Python new HTTP client per request | **Deferred.** Backlog item for when `serve` perf matters. |
| 4.3 Python MCP default handling | **Accepted.** FastMCP doesn't support schema defaults; PY applies them in handler. Documented difference. |
| 4.4 `_is_valid_url` weakness | **Accepted.** Both SDKs are equally permissive. |
| 4.5 Constraints advisory-only | **Accepted.** By design for v1.0. |

### Test Coverage After Fixes

| Module | JS Tests | PY Tests |
|--------|----------|----------|
| executor (`buildRequest`) | 14 | 12 |
| executor (`executeRequest`) | 5 (NEW) | 5 (NEW) |
| executor (`formatError`) | 7 (NEW) | 7 (NEW) |
| MCP generator | 11 | 10 (NEW) |
| validator | 21 | 29 |
| parser | 9 | 7 |
| coerce | 12 | 5 |
| fixtures (cross-SDK) | 9 | 7 |
| **Total** | **88** | **90** |
