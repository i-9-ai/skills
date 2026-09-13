# Mirror public documentation to the GitHub Wiki

## Objective

Keep the GitHub Wiki synchronized with the repository's canonical public documentation after changes to `docs/` merge into `main`.

## Scope

- Treat the entire `docs/` tree as public documentation.
- Move the documentation-specific agent instruction out of `docs/` into `.agents/references/`.
- Add a `main`-branch-only synchronization workflow with read-only repository permissions and an explicit `WIKI_SYNC_TOKEN` secret for the separate Wiki repository write.
- Copy `docs/` directly into the Wiki repository; rename `index.md` to GitHub Wiki's `Home.md` at synchronization time.

## Exclusions

- No publication of `AGENTS.md`, `.agents/`, `plans/`, source, tests, CI internals, secrets, or local paths because only `docs/` is mirrored.
- No automatic repository visibility change, release, or third-party publication.
- No content transformation that silently changes documentation meaning.

## Authority boundaries

The workflow writes to the Wiki only when the maintainer supplies `WIKI_SYNC_TOKEN`; without it, the synchronization job fails clearly before attempting a push. The token is an Actions secret with write access to the repository Wiki. GitHub Wiki creation and its initial private content are authorized by the repository owner in this task. Any later public visibility change remains separate.

## Validation

- The workflow runs only after a push to `main` that changes `docs/`, plus explicit manual dispatch.
- The Wiki working tree matches `docs/`, except that `index.md` is named `Home.md`.
- A missing token fails before cloning or pushing; an unchanged mirror does not create a commit.
- Run `npm run check`, `git diff --check`, and shell/YAML review before Wiki initialization.

## Rollback

Disable the workflow or remove its secret to stop synchronization. Revert documentation or the workflow in Git; restore the previous Wiki revision from its own Git history if needed.
