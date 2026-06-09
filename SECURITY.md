# Security policy

## Reporting a vulnerability

**Please don't open a public issue for security problems.** Report it privately through GitHub: on this repo, go to the **Security** tab → **Report a vulnerability**. This opens a private advisory thread with the maintainer — nothing is public until a fix ships.

Include:

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
- Knowledge-update bundle verification bypass (ed25519 signature or sha256 commitment checks in the pull-updates path)
- Any AGPL-3.0 license-circumvention mechanism baked into the code

## What we consider out of scope

- Issues that require physical access to a self-hosted box
- DoS via burning your own Anthropic API credit
- Social engineering of the maintainer
- Bugs in upstream dependencies (report those upstream; cross-reference in a separate issue here if there's a Príncipe-side mitigation worth tracking)

Thank you for keeping the project safe.
