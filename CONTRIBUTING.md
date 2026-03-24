# Contributing to UsePaso

Thanks for your interest in contributing!

## Setup

### Node.js SDK

```bash
cd packages/paso-js
npm install
npm test          # run tests
npx tsc --noEmit  # type check
```

### Python SDK

```bash
cd packages/paso-py
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pytest tests/ -v
```

## Making Changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. If you changed the spec or added a feature, update **both** SDKs (JS and Python)
4. If you changed the spec, update the examples in `examples/`
5. Add or update tests
6. Run tests in both SDKs
7. Use [conventional commit](https://www.conventionalcommits.org/) messages:
   - `feat: add A2A generator`
   - `fix: handle empty capabilities array`
   - `docs: update quickstart`
8. Open a PR against `main`

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new feature
fix: fix a bug
docs: documentation only
test: add or update tests
refactor: code change that neither fixes nor adds
chore: tooling, CI, dependencies
```

**No signatures or author lines.** Do not add `Co-Authored-By`, `Signed-off-by`, or any other attribution to commit messages. Keep them clean.

## Project Structure

```
usepaso/
├── spec/              # The usepaso.yaml format spec (source of truth)
├── examples/          # Real-world usepaso.yaml files
├── packages/
│   ├── paso-js/       # Node.js SDK (TypeScript)
│   └── paso-py/       # Python SDK
```

## Key Rules

- **Spec is the source of truth.** Both SDKs must implement the spec faithfully.
- **Both SDKs must stay in sync.** A feature in one must exist in the other.
- **Examples must validate.** All examples in `examples/` must pass `usepaso validate`.
- **Tests are required.** No PR without tests.

## Engineering Principles

We follow a few standard principles. Here's how they show up concretely in this project:

**Single Source of Truth (SSOT)** — Every piece of knowledge has exactly one canonical home. The spec format lives in `spec/usepaso-spec.md`. Validation rules live in `spec/usepaso.schema.json`. The init template lives in `examples/template/usepaso.yaml`. Version numbers live in `package.json` and `pyproject.toml`. Don't duplicate these — reference them. See the SSOT table in `AGENTS.md` for the full mapping.

**Don't Repeat Yourself (DRY)** — The two SDKs are an intentional exception: TypeScript and Python can't share code, so logic is implemented twice. Our mitigation is shared test fixtures in `test-fixtures/` — both SDKs run the same YAML input/output pairs, so behavioral drift is caught automatically. Within each SDK, HTTP logic lives in a single `executor` module (see the [shared executor decision](decisions.md) for why).

**Single Responsibility** — Each module does one thing. The parser reads YAML. The validator checks rules. The executor builds and sends HTTP requests. The MCP generator wires capabilities to tools. The CLI commands are thin glue. Functions should be pure where possible — `buildRequest` takes data in and returns data out, it doesn't read env vars or log to stderr. Side effects belong in the CLI entry points.

**Fail Loud, Fail Early** — Silent failures are the most expensive kind of bug. Every `switch`/`if-elif` on a type discriminator (`auth.type`, `input.in`) must have an explicit `default`/`else` that throws or warns — never a silent fallthrough. Functions throw errors rather than calling `process.exit()`/`sys.exit()`, so callers can catch and report multiple problems at once. The validator collects all errors before returning, not one at a time.

**Least Privilege** — The spec is designed around this: capabilities have `permission` tiers (`read`/`write`/`admin`), `consent_required` for destructive actions, `constraints` for rate limits and value bounds, and a `forbidden` list to explicitly block endpoints agents should never call. When adding new features, default to restrictive — agents should only get access to what's explicitly declared.

For the project-specific engineering rules (fix discipline, testing patterns, dual-SDK parity), see the `Engineering Rules` section in `AGENTS.md`. For the reasoning behind these decisions, see `decisions.md`.

## Questions?

Open an issue or start a discussion.
