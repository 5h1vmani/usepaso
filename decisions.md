# Technical Decisions

Non-obvious choices and the reasoning behind them. Newest first.

---

### 2026-03-24: Engineering rules added to AGENTS.md

**Decision:** Added a set of engineering rules to AGENTS.md covering fix discipline, code patterns, and dual-SDK parity. These are mechanical rules, not aspirations.

**Why:** A full codebase audit found 47 issues, including 6 critical bugs. We fixed all 6, wrote tests, and declared victory. A self-review then found we'd missed: 2 shared fixtures for the exact bugs we fixed, a per-request stderr notice that spams MCP servers, zero tests for a coercion function we wrote, a UX problem where CLI users see errors one at a time, and no user warning for circular $ref fallbacks.

The root cause was consistent across all gaps:

1. **We tested that new code works, not that old bugs can't recur.** We wrote `auth-bearer.yaml` but forgot `auth-oauth2.yaml` — the fixture for the exact bug we fixed. The principle: the first test for a bug fix must reproduce the bug.

2. **We never used the CLI as a user would.** A 30-second `usepaso serve` would have revealed the notice printing on every request. Unit tests exercise functions in isolation and miss integration-level UX problems.

3. **We wrote code and tests in the same pass.** When you write both together, you test what you wrote, not what should be true. The coercion function was written to reject `Infinity` but we never tested `Infinity` — we tested the happy path of valid integers.

4. **Side effects were buried inside pure-looking functions.** `buildRequest` read env vars and wrote to stderr. This made it untestable for some behaviors and caused the per-request notice spam. Functions should be pure; side effects belong at the edges.

5. **`process.exit` killed testability.** Every function that calls `process.exit` is untestable. We had to refactor `coerceValue` from exit-on-error to throw-on-error before we could test it. The convention should be "throw, don't exit" from day one.

These rules are now in AGENTS.md so both human and AI contributors follow them mechanically.

---

### 2026-03-24: AGENTS.md instead of CLAUDE.md

**Decision:** Use a generic `AGENTS.md` file for AI coding agent instructions instead of agent-specific files like `CLAUDE.md`, `.cursorrules`, or `GEMINI.md`.

**Why:** Contributors use different AI coding tools (Claude Code, Cursor, Codex, Gemini, Windsurf). One file for all agents avoids maintaining multiple files with the same content. Most tools now look for `AGENTS.md` as a convention.

---

### 2026-03-24: JSON Schema as validation SSOT

**Decision:** `spec/usepaso.schema.json` is the machine-readable source of truth for validation rules. Both validators (JS + Python) implement these rules, but the schema is the reference.

**Why:** Having two validators in two languages means validation logic is inherently duplicated. The JSON Schema gives us one canonical definition. It also enables editor autocomplete for `usepaso.yaml` files via YAML Language Server.

---

### 2026-03-24: Shared executor pattern

**Decision:** All HTTP request logic lives in a single `executor` module per SDK. Both the `test` CLI command and the `serve` MCP server use it.

**Why:** We had a bug where the Python MCP generator had its own HTTP logic that diverged from the executor — different URL construction, different error formatting, `--verbose` logging didn't work. Single module = one place to fix bugs, consistent behavior everywhere.

---

### 2026-03-24: Split CLI commands into separate files (JS only)

**Decision:** JS CLI uses one file per command in `src/commands/`. Python CLI keeps all commands in one file with a tech debt comment.

**Why:** Commander (JS) supports clean command registration from separate modules. Click (Python) uses decorators tied to the group object, making splits harder without architectural changes. At ~350 lines, the Python CLI is manageable. Refactor when it exceeds ~500 lines or gets 2+ more commands.

---

### 2026-03-23: `usepaso` not `paso` for package name

**Decision:** Package name is `usepaso` on both npm and PyPI. CLI command is `usepaso`. Config file is `usepaso.yaml`.

**Why:** `paso` was already taken on both npm (a dataflow library) and PyPI (7 versions published). Rather than having different names per platform or a mismatch between package and CLI, we went with `usepaso` everywhere for consistency. The domain `usepaso.dev` was available, reinforcing the brand.

---

### 2026-03-23: Python import name `paso` differs from package name `usepaso`

**Decision:** `pip install usepaso` but `from paso import ...`.

**Why:** The internal Python module directory is `paso/`, which was created before the rename to `usepaso`. Renaming the module directory would break the import path and require renaming every internal import across all files and tests. This pattern is common in Python (Pillow → `import PIL`, beautifulsoup4 → `import bs4`). We document it clearly in README and AGENTS.md.

---

### 2026-03-23: Two SDKs from day one (Node.js + Python)

**Decision:** Ship both TypeScript and Python SDKs simultaneously instead of one first.

**Why:** The developer ecosystem is split between Node.js and Python. Shipping only one would exclude a large portion of potential users. The SDKs are small enough (~1500 lines each) that maintaining both is manageable. The AGENTS.md "both must stay in sync" rule prevents drift.

---

### 2026-03-23: YAML declaration format (not code-based config)

**Decision:** Capability declarations are YAML files (`usepaso.yaml`), not TypeScript/Python code.

**Why:**
- Human-readable and agent-readable (agents can discover capabilities by reading YAML)
- Git-diffable (changes to capabilities show up clearly in PRs)
- Language-agnostic (same file works with both JS and Python SDKs)
- Familiar to developers (like `docker-compose.yaml`, `openapi.yaml`, `.github/workflows/*.yml`)
- Security teams can audit what agents are allowed to do without reading code

---

### 2026-03-23: Open-core model (Apache 2.0)

**Decision:** SDK is Apache 2.0 open source.

**Why:** Developers strongly prefer open-source tools they can self-host and audit. Apache 2.0 (not AGPL/SSPL) because we want maximum adoption and minimal friction for contributors and users.

---

### 2026-03-23: `$ref` resolution in OpenAPI importer

**Decision:** The OpenAPI-to-usepaso converter resolves `$ref` pointers inline before processing.

**Why:** Most real-world OpenAPI specs use `$ref` extensively (e.g., `$ref: '#/components/schemas/Pet'`). Without resolution, the converter would produce empty inputs/outputs for any spec that uses references — which is nearly all of them. We do recursive in-memory resolution rather than requiring a separate dereferencing step.

---

### 2026-03-23: Cap OpenAPI import at 20 capabilities

**Decision:** The `--from-openapi` converter limits output to 20 capabilities.

**Why:** Large APIs (Stripe has 300+ endpoints) would produce an overwhelming `usepaso.yaml`. The developer should curate which endpoints agents can access, not expose everything. 20 is enough to be useful while keeping the file reviewable. The CLI warns when operations are capped so developers know to edit the file.
