# Security Policy

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, use [GitHub's private vulnerability reporting](https://github.com/5h1vmani/usepaso/security/advisories/new).

You should receive a response within 48 hours. If the issue is confirmed, we will release a patch as soon as possible.

## What Qualifies

- Authentication token leakage (e.g., `USEPASO_AUTH_TOKEN` exposed in logs or error messages)
- Injection vulnerabilities in YAML parsing or HTTP request construction
- Path traversal in file handling
- Dependency vulnerabilities with a known exploit

## What Does NOT Qualify

- Missing features or feature requests
- Bugs that don't have a security impact
- Denial of service through large YAML files (we don't run a hosted service)

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |
| < Latest | No — please upgrade |
