# Security policy

## Reporting a vulnerability

**Please don't open a public issue for security problems.** Email **service@principe.cloud** with:

- A clear description of the vulnerability
- Steps to reproduce
- Affected version (commit hash or release tag)
- Your assessment of impact (data exposure, RCE, auth bypass, etc.)

You'll get an acknowledgment within 48 hours. For high/critical issues we aim to ship a fix or mitigation within 7 days.

## Scope

Príncipe is **pre-alpha**. Security boundaries are still being firmed up — treat any self-hosted instance the way you'd treat any pre-1.0 software. Don't expose it to the public internet without a reverse proxy + auth in front of it, and don't feed it secrets you wouldn't put in a notebook on your laptop.

## What we consider in scope

- Authentication / session bypass
- Server-side request forgery, SQL injection, command injection, deserialization issues
- Statistician service contract violations that could leak data across panel runs
- Knowledge-update bundle verification bypass (once Sprint 9 ships signed bundles)
- Any AGPL-3.0 license-circumvention mechanism baked into the code

## What we consider out of scope

- Issues that require physical access to a self-hosted box
- DoS via burning your own Anthropic API credit
- Social engineering of the maintainer
- Bugs in upstream dependencies (report those upstream; cross-reference in a separate issue here if there's a Príncipe-side mitigation worth tracking)

Thank you for keeping the project safe.
