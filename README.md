# Príncipe

> Open-source CISO panel simulator — self-hosted, AGPL-3.0.

Príncipe spins up a configurable panel of synthetic CISO personas (regions, industries, company sizes, stances) and runs them against your security strategy questions. Each panel call returns synthesized verdicts plus statistical-soundness checks from a self-hosted Bayesian Statistician service. No cloud accounts, no central control plane — your data stays on the box you run it on.

The name is a nod to the 1919 Príncipe eclipse expedition, where Eddington's plates proved general relativity by *observing* what theory predicted. Same idea here: prove what's coming before reality runs the experiment.

## Status

**Pre-alpha.** Installable, but not yet polished. Sprint 8 (this sprint) shipped the docker-compose distribution + first-run wizard. Sprint 9 will add signed daily knowledge bundles. v1.0 lands when both sprints are battle-tested and the install story is rock-solid on macOS + Linux.

## Quickstart

You need **Docker Desktop / Docker Engine ≥ 24** and an **Anthropic API key**. That's it.

```bash
git clone https://github.com/omergrossman/principe-oss
cd principe-oss
./bin/start.sh
```

The script:

1. Generates strong random secrets on first run (written to `.env.runtime`, chmod 600, gitignored)
2. `docker compose up -d --build` — boots Postgres + Statistician + web app
3. Watch progress: `docker compose logs -f web statistician`

When healthy (≈3-5 min on first boot, seconds on subsequent boots), open **http://localhost:3000** and complete the setup wizard:

- **Workspace name** (your org name)
- **Admin email + display name**
- **Anthropic API key** (validated against `api.anthropic.com` before being persisted — AES-256-GCM encrypted at rest)
- *Optional:* **Resend API key** (only needed if you want passkey-reset emails)
- **Register a passkey** (Touch ID, Face ID, or a security key)

Then ask the panel a question and you're running.

## Architecture

Three containers, one compose file:

| Container | What it runs | Default port |
|---|---|---|
| `web` | Next.js 16 + Prisma 7. Hosts the UI + API. | 3000 |
| `statistician` | FastAPI + PyMC. Bayesian verdict service. Internal-only — talks to `web` over the docker network. | 8000 (internal) |
| `db` | Postgres 16. Persistent volume so data survives `docker compose down`. | 5432 (internal) |

No traffic leaves your box except calls to:

- `api.anthropic.com` (the panel uses your Anthropic key)
- `api.resend.com` (only if you configured a Resend key)

Telemetry, update checks, and central knowledge sync are **opt-in only**. Sprint 9's signed-bundle update mechanism will be pull-based, never push.

## Stopping / restarting

```bash
docker compose down              # stop, keep data
docker compose down -v           # stop + wipe Postgres data + start fresh
./bin/start.sh                   # boot back up (reuses .env.runtime)
```

## Rotating secrets

```bash
rm .env.runtime
./bin/start.sh    # regenerates STATISTICIAN_SHARED_SECRET + PRINCIPE_ENCRYPTION_KEY
```

⚠️ Rotating `PRINCIPE_ENCRYPTION_KEY` means any stored API keys can no longer be decrypted. You'll need to re-enter your Anthropic key in Settings after rotation.

## Putting it behind a reverse proxy

Set `WEBAUTHN_ORIGIN=https://your-domain.example` in `.env.runtime` before booting so passkey ceremonies bind to the right origin. Then point your reverse proxy (nginx / Caddy / Cloudflare Tunnel) at `http://localhost:3000`.

## License

[AGPL-3.0](LICENSE). If you host Príncipe as a service and expose it over a network, you must release your modifications under the same terms. This is intentional — Príncipe is a community tool, not free fuel for proprietary platforms.

## Contributing

PRs are paused until Sprint 8 stabilizes (the codebase is mid-migration from its SaaS-era monorepo). Issues and discussions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

Found a vulnerability? Don't open a public issue. See [SECURITY.md](SECURITY.md).

## Contact

service@principe.cloud
