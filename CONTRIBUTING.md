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

## Questions?

Open an issue or start a discussion.
