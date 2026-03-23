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
│   │   │   │   └── serve.ts
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
│       ├── paso/
│       │   ├── cli.py            # CLI (all commands in one file — see tech debt note inside)
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
- `validate`: `valid (ServiceName, N capabilities)`
- `serve`: `usepaso serving "ServiceName" (N capabilities)`
- `test --dry-run`: `--- DRY RUN (no request will be made) ---`
- `inspect`: Same table format in both

### 5. Naming Convention

- Product name: **UsePaso** (capital U, capital P in prose)
- Config file: `usepaso.yaml` (not `paso.yaml`)
- Env var: `USEPASO_AUTH_TOKEN` (not `PASO_AUTH_TOKEN`)
- CLI binary: `usepaso` (not `paso`)
- npm package: `usepaso` → `import { ... } from 'usepaso'`
- PyPI package: `usepaso` → `from paso import ...` (note: different import name — this is intentional, like Pillow/PIL)
- Directory names `paso-js` and `paso-py` are internal — these are not user-facing
- Type names use `Paso` prefix (e.g., `PasoDeclaration`, `PasoCapability`) — this is intentional, don't rename to `UsePaso*`

## What NOT To Do

- **Don't add a feature to one SDK only.** Both must have parity.
- **Don't hardcode version numbers.** CLIs read from package metadata.
- **Don't inline the init template.** Read from `examples/template/usepaso.yaml`.
- **Don't add HTTP logic outside executor.** All HTTP goes through `executor.ts` / `executor.py`.
- **Don't change the spec without updating the JSON Schema.** `spec/usepaso.schema.json` must match `spec/usepaso-spec.md`.
- **Don't change validation rules without updating both validators AND the schema.**
- **Don't add dependencies without good reason.** Both SDKs should stay lightweight.

## Conventions

- **TypeScript:** ESLint + Prettier enforced. Single quotes, trailing commas, 100 char width.
- **Python:** Standard library style. Type hints where helpful. No formatter enforced yet.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.
- **Tests:** All examples in `examples/` must pass `usepaso validate`. Parser and validator have unit tests. New features need tests.

## How to Add a New CLI Command

### Node.js
1. Create `src/commands/yourcommand.ts` with a `registerYourCommand(program: Command)` function
2. Wire it in `src/cli.ts` with `registerYourCommand(program)`

### Python
1. Add the command in `paso/cli.py` using the `@main.command('yourcommand')` decorator
2. Follow the existing pattern (use `_load_and_validate` for file loading)

## How to Add a New Output Generator (e.g., A2A)

1. Create `src/generators/a2a.ts` / `paso/generators/a2a.py`
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
