# Príncipe

> Open-source CISO panel simulator — self-hosted, AGPL-3.0.

Príncipe spins up a configurable panel of synthetic CISO personas (regions, industries, company sizes, stances) and runs them against your security strategy questions. Each panel call returns synthesized verdicts plus statistical-soundness checks from a self-hosted Bayesian Statistician service. No cloud accounts, no central control plane — your data stays on the box you run it on.

The name is a nod to the 1919 Príncipe eclipse expedition, where Eddington's plates proved general relativity by *observing* what theory predicted. Same idea here: prove what's coming before reality runs the experiment.

## Status

**Pre-alpha.** The codebase is mid-migration from its SaaS-era monorepo to a clean OSS distribution.

| Milestone | Target | Ships |
|---|---|---|
| Sprint 8 — `docker compose up` works | ~July 2026 | docker-compose, Statistician container, first-run wizard, BYO API keys |
| Sprint 9 — knowledge updates | ~August 2026 | Signed daily knowledge bundles from `updates.principe.cloud` |
| v1.0 — public launch | TBD | When Sprint 8 + 9 ship and a fresh clone "just works" |

Until Sprint 8 ships, **don't expect this repo to install**. Star it, watch it, file issues on the design — but the install story isn't real yet.

## License

[AGPL-3.0](LICENSE). If you host Príncipe as a service and expose it over a network, you must release your modifications under the same terms. This is intentional — Príncipe is a community tool, not free fuel for proprietary platforms.

## Contributing

PRs are paused until Sprint 8 lands. Issues and discussions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

Found a vulnerability? Don't open a public issue. See [SECURITY.md](SECURITY.md).

## Contact

service@principe.cloud
