# Agent Instructions

This file is for AI coding agents (Claude Code, Cursor, Codex, Gemini, Windsurf, etc.) working on this codebase.

## What This Project Is

UsePaso is an open-source SDK that lets any service declare what AI agents can do with their API. Developers write a `usepaso.yaml` declaration, and the SDK generates a working MCP server. Two SDK implementations exist: Node.js (TypeScript) and Python. Both must behave identically.

## Architecture

```
usepaso/
├── spec/
│   ├── usepaso-spec.md              # Human-readable spec (SSOT for the format)
│   └── usepaso.schema.json       # JSON Schema (SSOT for validation rules)
├── examples/
│   ├── template/usepaso.yaml     # Init template (SSOT — both CLIs read this)
│   ├── sentry/usepaso.yaml
│   ├── stripe/usepaso.yaml
│   └── linear/usepaso.yaml
├── packages/
│   ├── paso-js/                  # Node.js SDK (TypeScript)
│   │   ├── src/
│   │   │   ├── cli.ts            # CLI entry point (thin — wires commands)
│   │   │   ├── commands/         # One file per CLI command
│   │   │   │   ├── shared.ts     # Shared helpers (loadAndValidate, mcpConfigSnippet)
│   │   │   │   ├── init.ts
│   │   │   │   ├── validate.ts
│   │   │   │   ├── inspect.ts
│   │   │   │   ├── test.ts
│   │   │   │   ├── serve.ts
│   │   │   │   └── doctor.ts
│   │   │   ├── utils/
│   │   │   │   ├── coerce.ts     # CLI value coercion (shared with tests)
│   │   │   │   └── color.ts      # ANSI color utilities
│   │   │   ├── parser.ts         # Parse usepaso.yaml → typed object
│   │   │   ├── validator.ts      # Validate declaration against spec
│   │   │   ├── executor.ts       # Build + execute HTTP requests (shared by test + serve)
│   │   │   ├── generators/
│   │   │   │   └── mcp.ts        # Generate MCP server from declaration
│   │   │   ├── openapi.ts        # Convert OpenAPI spec → usepaso.yaml
│   │   │   ├── types.ts          # TypeScript type definitions
│   │   │   └── index.ts          # Public API exports
│   │   └── tests/
│   └── paso-py/                  # Python SDK
│       ├── usepaso/
│       │   ├── cli.py            # CLI entry point (thin — wires commands)
│       │   ├── commands/         # One file per CLI command
│       │   │   ├── shared.py     # Shared helpers (load_and_validate, mcp_config_snippet)
│       │   │   ├── init_cmd.py
│       │   │   ├── validate_cmd.py
│       │   │   ├── inspect_cmd.py
│       │   │   ├── test_cmd.py
│       │   │   ├── serve_cmd.py
│       │   │   └── doctor_cmd.py
│       │   ├── utils/
│       │   │   ├── coerce.py     # CLI value coercion (shared with tests)
│       │   │   └── color.py      # Color utilities (click.style wrapper)
│       │   ├── parser.py
│       │   ├── validator.py
│       │   ├── executor.py
│       │   ├── generators/
│       │   │   └── mcp.py
│       │   ├── openapi.py
│       │   └── types.py
│       └── tests/
├── AGENTS.md                     # This file — instructions for AI coding agents
├── CONTRIBUTING.md               # Human contributor guide
├── decisions.md                  # Technical decision log (why we built it this way)
├── LICENSE                       # Apache 2.0
└── README.md
```

## Build and Test

### Node.js SDK

```bash
cd packages/paso-js
npm install
npm run build          # tsc
npm test               # vitest
npm run lint           # eslint
npm run format:check   # prettier
```

### Python SDK

```bash
cd packages/paso-py
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pytest tests/ -v
```

### Verify Everything

After any change, both must pass:
```bash
cd packages/paso-js && npm run build && npm run lint && npm test
cd packages/paso-py && pytest tests/ -v
```

## Critical Rules

### 1. Both SDKs Must Stay In Sync

Every feature, bug fix, or behavior change must be applied to BOTH the Node.js and Python SDKs. They must produce identical output for the same input. If you change one, change the other.

### 2. Single Source of Truth (SSOT)

| Truth | Lives in | Do NOT duplicate in |
|-------|----------|---------------------|
| Spec format definition | `spec/usepaso-spec.md` | Code comments |
| Validation rules | `spec/usepaso.schema.json` | Validators (they implement it, but the schema is the source) |
| Init template | `examples/template/usepaso.yaml` | CLI code (CLIs read the file, with inline fallback only for npm/pip installs) |
| Version number | `packages/paso-js/package.json` and `packages/paso-py/pyproject.toml` | CLI code (CLIs read from package metadata at runtime) |
| Example declarations | `examples/*/usepaso.yaml` | Tests reference these, don't copy them |

### 3. Shared Executor for All HTTP Calls

Both `usepaso test` and `usepaso serve` use the same executor module (`executor.ts` / `executor.py`) for building and executing HTTP requests. Do NOT add HTTP logic anywhere else. This ensures:
- Consistent request building (URL construction, auth, headers)
- Consistent error formatting (401/403/404 get contextual help)
- `--verbose` logging works for both test and serve

### 4. CLI Output Must Be Identical

Both SDKs must produce the same CLI output for the same operation. If you change a message in one, change it in the other. Key formats:
- `validate`: `valid (ServiceName, N capabilities, 0 regrets)`
- `validate --strict`: best-practice warnings listed after the valid line
- `serve`: `usepaso serving "ServiceName" (N capabilities). Agents welcome.`
- `test --dry-run`: `--- DRY RUN (no request will be made) ---`
- `test --all --dry-run`: `ok <capName> <METHOD> <URL>` per capability, summary at end
- `inspect`: Same table format in both
- `doctor`: Same check names and pass/fail format in both
- `completion`: Same shell scripts in both

### 5. Naming Convention

- Product name: **UsePaso** (capital U, capital P in prose)
- Config file: `usepaso.yaml` (not `paso.yaml`)
- Env var: `USEPASO_AUTH_TOKEN` (not `PASO_AUTH_TOKEN`)
- CLI binary: `usepaso` (not `paso`)
- npm package: `usepaso` → `import { ... } from 'usepaso'`
- PyPI package: `usepaso` → `from usepaso import ...`
- Directory names `paso-js` and `paso-py` are internal — these are not user-facing
- Type names use `Paso` prefix (e.g., `PasoDeclaration`, `PasoCapability`) — this is intentional, don't rename to `UsePaso*`

## Engineering Rules

These exist because we've been burned by their absence. See `decisions.md` for the reasoning.

### Fix Discipline
- **First test = bug reproduction.** For every bug fix, the first test you write must reproduce the original bug. Not a test of the new code — a test that fails before the fix and passes after.
- **Shared fixtures before unit tests.** When fixing cross-SDK behavior, add a fixture in `test-fixtures/` first. Both SDKs must pass it. Unit tests in each SDK are supplementary.
- **Use the CLI after changing it.** After modifying any CLI command, manually run it once as a user would (`usepaso test --dry-run`, `usepaso validate`). Automated tests exercise functions in isolation — they don't catch UX problems like stderr spam or confusing error ordering.
- **Read the full diff before declaring done.** Not the files — the diff. Ask: "what are the second-order effects of each change?"

### Code Patterns
- **Throw, don't exit.** Functions must throw errors (or return error objects), never call `process.exit()` / `sys.exit()` directly. The CLI entry point catches and exits. This keeps all logic testable.
- **Exhaustive matching on every type discriminator.** Every `switch`/`if-elif` on a type field (`auth.type`, `input.in`, etc.) must have a `default`/`else` that throws or warns. Silent fallthrough is a bug.
- **Keep side effects at the edges.** Functions like `buildRequest` must be pure — no reading env vars, no writing to stderr. Pass data in, get data out. The CLI command layer handles env vars and logging.
- **Collect all errors, then report.** When validating user input (params, YAML fields), collect all errors into a list and report them together. Never exit on the first error.

### Dual-SDK Parity
- **Fixture-first development.** New features start with a shared YAML fixture in `test-fixtures/`. Implement in both SDKs until the fixture passes. This is the contract between the SDKs.
- **Defaults must be identical.** If JS defaults `api_key` header to `Authorization`, Python must too. Grep for default values when reviewing parity.
- **CI validates what users experience.** CI must run `usepaso validate` on all examples AND `usepaso test --dry-run` on at least one example with a path-prefix base_url. Validation alone doesn't catch runtime bugs.

## What NOT To Do

- **Don't add a feature to one SDK only.** Both must have parity.
- **Don't hardcode version numbers.** CLIs read from package metadata.
- **Don't inline the init template.** Read from `examples/template/usepaso.yaml`.
- **Don't add HTTP logic outside executor.** All HTTP goes through `executor.ts` / `executor.py`.
- **Don't change the spec without updating the JSON Schema.** `spec/usepaso.schema.json` must match `spec/usepaso-spec.md`.
- **Don't change validation rules without updating both validators AND the schema.**
- **Don't add dependencies without good reason.** Both SDKs should stay lightweight.

## Voice Rules (user-facing text)

All CLI output, error messages, help strings, and READMEs follow these rules:

- Say the fact. No adjectives you can't prove.
- Errors: say what's wrong, say what to do, link to docs. No emoji. No "oops."
- No hype words: "revolutionary," "seamless," "game-changing," "excited," "empower," "solution."
- Periods over exclamation marks. Always.
- Use "declare" (not "define" or "configure"), "agent-ready," "ship" (not "deploy" in casual contexts).
- Short sentences. If you can say it shorter, do.
- No em dashes. Use a comma, a period, or restructure the sentence.
- Show, don't claim. Show the code or the number. Don't say "best."

## Conventions

- **TypeScript:** ESLint + Prettier enforced. Single quotes, trailing commas, 100 char width.
- **Python:** Standard library style. Type hints where helpful. No formatter enforced yet.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.
- **No signatures or author lines in commit messages.** Do not add `Co-Authored-By`, `Signed-off-by`, or any other attribution lines. Keep commit messages clean — just the conventional commit message, nothing else.
- **Tests:** All examples in `examples/` must pass `usepaso validate`. Parser and validator have unit tests. New features need tests.

## How to Add a New CLI Command

### Node.js
1. Create `src/commands/yourcommand.ts` with a `registerYourCommand(program: Command)` function
2. Wire it in `src/cli.ts` with `registerYourCommand(program)`

### Python
1. Create `usepaso/commands/yourcommand_cmd.py` with a `register(cli_group)` function
2. Wire it in `usepaso/cli.py` with `yourcommand_cmd.register(main)`
3. Use `from usepaso.commands.shared import load_and_validate` for file loading

## How to Add a New Output Generator (e.g., A2A)

1. Create `src/generators/a2a.ts` / `usepaso/generators/a2a.py`
2. The generator takes a `PasoDeclaration` and produces the protocol-specific output
3. Use the shared `executor` for any HTTP logic
4. Add a CLI command or flag to use it (e.g., `usepaso serve --protocol a2a`)
5. Add to both SDKs

## How to Modify the Spec

1. Update `spec/usepaso-spec.md` (the human-readable spec)
2. Update `spec/usepaso.schema.json` (the machine-readable schema)
3. Update both validators (`validator.ts` + `validator.py`)
4. Update both parsers/types if new fields are added
5. Update examples if needed
6. Run all tests in both SDKs
