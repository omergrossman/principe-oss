# Contributing to Príncipe

Thanks for stopping by. The project is in active early-stage development — here's what's open and what isn't right now.

It's still **pre-alpha**, so expect rough edges and the occasional structural change — but the project is open to contributions.

## Where things happen

- **[Issues](https://github.com/omergrossman/principe-oss/issues).** Bug reports against the app or docs, feature ideas, install-story pain points, persona/region coverage gaps — file freely.
- **[Discussions](https://github.com/omergrossman/principe-oss/discussions).** Strategy questions, panel-composition ideas, sources for the knowledge base, what-if scenarios.
- **Security.** Don't open a public issue — see [SECURITY.md](SECURITY.md) for private reporting.

## Pull requests

PRs are welcome. To keep them easy to review and land:

- **Open an issue or discussion first** for anything non-trivial, so we agree on the approach before you build it.
- **One topic per PR.** Split big refactors into reviewable chunks.
- **It builds and typechecks:** `pnpm -C apps/principe typecheck` and `pnpm -C apps/principe build` pass locally.
- **Conventional commit style:** `feat(panel): ...`, `fix(statistician): ...`, `docs: ...`.
- **AGPL-3.0 sign-off** in the commit body: `Signed-off-by: Your Name <you@example.com>`. By signing off you confirm you have the right to contribute the change under AGPL-3.0.

Because the codebase is still settling, a maintainer may ask you to rebase or hold a PR if it collides with in-flight structural work — open that issue first and we'll flag it early.

## Code of conduct

Be kind, be specific, assume good faith. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

— Omer
