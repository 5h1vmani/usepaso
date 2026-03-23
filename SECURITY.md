# Security Policy

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, use [GitHub's private vulnerability reporting](https://github.com/5h1vmani/usepaso/security/advisories/new).

You should receive a response within 48 hours. If the issue is confirmed, we will release a patch as soon as possible.

## Disclosure Timeline

- **Day 0:** Report received, acknowledgment sent within 48 hours
- **Day 1–7:** We triage and confirm the vulnerability
- **Day 7–30:** We develop and test a fix
- **Day 30–90:** Fix released, advisory published
- **Day 90:** Public disclosure (coordinated with reporter)

We aim to resolve critical issues well before the 90-day window.

## What Qualifies

- Authentication token leakage (e.g., `PASO_AUTH_TOKEN` exposed in logs or error messages)
- Injection vulnerabilities in YAML parsing or HTTP request construction
- Path traversal in file handling or CLI operations
- Arbitrary code execution through malicious `paso.yaml` files
- Dependency vulnerabilities with a known exploit

## What Does NOT Qualify

- Missing features or feature requests
- Bugs that don't have a security impact
- Denial of service through large YAML files (we don't run a hosted service)

## Safe Harbor

We consider security research conducted in good faith to be authorized. We will not pursue legal action against researchers who:

- Act in good faith to avoid harm to users
- Report vulnerabilities through the process described above
- Do not access or modify other users' data
- Give us reasonable time to fix the issue before public disclosure

## Supported Versions

| Version  | Supported           |
| -------- | ------------------- |
| Latest   | Yes                 |
| < Latest | No — please upgrade |
