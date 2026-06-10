# Príncipe

> Open-source CISO panel simulator — self-hosted, AGPL-3.0.

Príncipe spins up a configurable panel of synthetic CISO personas (regions, industries, company sizes, stances) and runs them against your security strategy questions. Each panel call returns synthesized verdicts plus statistical-soundness checks from a self-hosted Bayesian Statistician service. No cloud accounts, no central control plane — your data stays on the box you run it on.

The name is a nod to the 1919 Príncipe eclipse expedition, where Eddington's plates proved general relativity by *observing* what theory predicted. Same idea here: prove what's coming before reality runs the experiment.

## Disclaimer

Príncipe's panel is composed of **synthetic, AI-generated personas** — not real CISOs, customers, or professional advisers. Every response is produced by a language model simulating a persona; no human is consulted, and no output represents the views of any real person or organisation.

Príncipe is a **decision-support and hypothesis-exploration tool**, not a source of professional advice. Its output is not legal, security, financial, or business advice, and must not be relied upon as a substitute for real customer research, qualified professionals, or your own due diligence. The statistical-soundness checks describe the *panel*, not the real world — a "valid" panel is still a simulation.

Treat the panel as **one input among many**. You remain solely responsible for any decision you make and its outcomes. The software is provided "as is", without warranty of any kind; accuracy, completeness, and fitness for any purpose are not guaranteed, and the authors accept no liability for decisions made on the basis of its output.

## Status

**Pre-alpha.** Installable, but not yet polished. The docker-compose distribution + first-run wizard and the signed daily knowledge feed (pull-based, ed25519-verified) are both live. v1.0 lands when the install story is battle-tested and rock-solid on macOS + Linux.

## Quickstart

The only thing you need to bring is an **Anthropic API key** (you'll paste it at the end). One command does the rest — it installs Docker if you don't have it, clones the repo, and boots the stack:

```bash
curl -fsSL https://raw.githubusercontent.com/omergrossman/principe-oss/main/install.sh | bash
```

> On macOS it installs Docker Desktop via Homebrew; on Linux via the official `get.docker.com` script — both ask first. Already have Docker? It skips straight to booting. Prefer not to pipe to `bash`? Download `install.sh`, read it, and run it.

<details>
<summary><strong>Or do it manually</strong> (if you already have Docker ≥ 24)</summary>

```bash
git clone https://github.com/omergrossman/principe-oss
cd principe-oss
./bin/start.sh
```

`bin/start.sh` generates strong random secrets on first run (`.env.runtime`, chmod 600, gitignored), then `docker compose up -d --build` boots Postgres + Statistician + web. Watch with `docker compose logs -f web statistician`.
</details>

When healthy (≈3-5 min on first boot, seconds on subsequent boots), the installer opens **http://localhost:3000** — complete the setup wizard:

- **Workspace name** (your org name)
- **Admin email + display name**
- **Anthropic API key** (validated against `api.anthropic.com` before being persisted — AES-256-GCM encrypted at rest)
- **Register a passkey** (Touch ID, Face ID, or a security key)

Then ask the panel a question and you're running.

## Supported platforms

The app runs entirely in Docker containers, so it behaves identically everywhere. Each OS has a one-command installer:

| OS | Command |
|---|---|
| **macOS / Linux** | `curl -fsSL https://raw.githubusercontent.com/omergrossman/principe-oss/main/install.sh \| bash` — sets up Docker if needed (Homebrew on macOS, `get.docker.com` on Linux). |
| **Windows** | See the PowerShell one-liner below. |

### Windows

Open **PowerShell** and run:

```powershell
irm https://raw.githubusercontent.com/omergrossman/principe-oss/main/install.ps1 | iex
```

`install.ps1` does the whole Windows setup for you — it requests Administrator rights, enables **WSL2** (Docker Desktop's engine needs it; **one reboot** the first time, after which the installer resumes automatically), installs **Docker Desktop** and **Git** via `winget`, clones the repo, and boots the stack. The only thing you provide is your Anthropic API key, in the wizard.

> Requires Windows 10 (2004+) or Windows 11 with `winget` (App Installer). On first Docker Desktop launch you may need to accept its terms once. If anything interrupts the install, just run the command again — it's safe to re-run and picks up where it left off.

## Architecture

Three containers, one compose file:

| Container | What it runs | Default port |
|---|---|---|
| `web` | Next.js 16 + Prisma 7. Hosts the UI + API. | 3000 |
| `statistician` | FastAPI + PyMC. Bayesian verdict service. Internal-only — talks to `web` over the docker network. | 8000 (internal) |
| `db` | Postgres 16. Persistent volume so data survives `docker compose down`. | 5432 (internal) |

No traffic leaves your box except calls to:

- `api.anthropic.com` (the panel uses your Anthropic key)

Telemetry, update checks, and central knowledge sync are **opt-in only**. Sprint 9's signed-bundle update mechanism is pull-based, never push.

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

## Knowledge updates

By default Príncipe ships in **local mode** — the calibration corpus in `calibration/` is what your panel reasons over, and there's no callout to any update endpoint. You see no "Check for updates" UI; nothing pings home.

If you want signed pull-updates — e.g. the official daily feed distilled from public cybersecurity sources — set **both** of these in `.env.runtime`. The URL alone isn't enough: the public key is what makes verification meaningful.

```env
PRINCIPE_UPDATES_URL=https://github.com/omergrossman/principe-feed/releases/download/latest
PRINCIPE_UPDATES_PUBLIC_KEY=56c8813a7d455b4ec58dd45d0befd6920438f4f37a6836f1542d7f2a730606b8
```

> ⚠️ `PRINCIPE_UPDATES_PUBLIC_KEY` is **required**. The key compiled into the build is a deliberate placeholder (`000…0`); without a real key set, every signed bundle is rejected. The value above is the official feed's ed25519 public key — verify it out-of-band if provenance matters to you, or use your own (see below).

Boot the stack. **Settings → Knowledge updates** appears. The flow:

1. Click "Check for updates" — fetches `latest.json` from the URL above.
2. If a new bundle is available, click "Install".
3. The app fetches the bundle tarball, verifies the manifest's ed25519 signature against your configured public key, confirms the bundle's sha256 matches the manifest's commitment, then writes the knowledge entries into your local DB.

To opt out entirely (no UI, no checks), set `PRINCIPE_UPDATES_URL=disabled`.

### Publishing your own bundles

Anyone can run their own update endpoint — no permission needed. See `scripts/build-bundle.ts` + `scripts/generate-keypair.ts`. Workflow:

```bash
# One-time: generate a keypair
pnpm tsx scripts/generate-keypair.ts
# Build a bundle from any directory matching the layout
# (knowledge/, datasets/, personas/)
PRINCIPE_UPDATES_PRIVATE_KEY_PATH=./updates-private.pem \
  pnpm tsx scripts/build-bundle.ts 2026-W23 ./bundle-input ./dist/updates
# Upload ./dist/updates to your static host (S3, R2, GitHub Pages, etc.)
# Consumers point PRINCIPE_UPDATES_URL at that host + PRINCIPE_UPDATES_PUBLIC_KEY
# at your generated public key.
```

## Putting it behind a reverse proxy

Set `WEBAUTHN_ORIGIN=https://your-domain.example` in `.env.runtime` before booting so passkey ceremonies bind to the right origin. Then point your reverse proxy (nginx / Caddy / Cloudflare Tunnel) at `http://localhost:3000`.

## License

[AGPL-3.0](LICENSE). If you host Príncipe as a service and expose it over a network, you must release your modifications under the same terms. This is intentional — Príncipe is a community tool, not free fuel for proprietary platforms.

## Contributing

PRs, issues, and discussions are all welcome — it's pre-alpha, so open an issue or discussion first for anything non-trivial. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

Found a vulnerability? Don't open a public issue. See [SECURITY.md](SECURITY.md).

## Contact

Everything happens on GitHub — no mailing list, no inbox to chase:

- **Questions, ideas, scenarios, sources** → [Discussions](https://github.com/omergrossman/principe-oss/discussions)
- **Bugs, docs, install pain** → [Issues](https://github.com/omergrossman/principe-oss/issues)
- **Security / private reports** → [SECURITY.md](SECURITY.md) (GitHub private vulnerability reporting)
