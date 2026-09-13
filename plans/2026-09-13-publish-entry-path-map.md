# Publish the interactive entry-path map

## Objective

Publish the generated interactive entry-path map from the `main` branch to GitHub Pages whenever its documentation source changes, so the README can offer a live exploration alongside its static Mermaid diagram.

## Scope

- Build a self-contained Pages site from `docs/assets/skill-management-entry-paths.html` after relevant changes merge into `main`.
- Publish the site to a dedicated `gh-pages` branch using a GitHub Actions workflow, then enable GitHub Pages to serve that branch.
- Keep the HTML artifact and its editable diagram specification versioned in the repository.
- Document the one-time repository setting that points GitHub Pages at the `gh-pages` branch.

## Exclusions

- No deployment from pull requests.
- No publishing of private plans, agent instructions, test fixtures, package assets, or the full documentation tree.
- No external analytics, tracking, credentials, custom domain, or automatic repository visibility change.
- No replacement of the Markdown/Mermaid documentation path.

## Authority boundaries

The workflow may write only the generated Pages branch after a merge to `main`. It must not publish packages, create releases, change repository settings, or publish from an unreviewed branch. A maintainer enables GitHub Pages to use the `gh-pages` branch as a separate one-time repository configuration action.

## Validation

- Confirm the generated site contains the interactive HTML and an explicit landing page.
- Confirm the workflow runs only on `main` changes to its source or itself, plus manual dispatch.
- Confirm a pull request cannot deploy Pages.
- Confirm a repeated build yields no unintended source-tree changes.
- Run repository checks and whitespace validation before review.

## Rollback

Disable the workflow or switch GitHub Pages away from `gh-pages` to stop publication. Revert the workflow or source artifact in `main`; Git history preserves prior Pages revisions.

## Execution status

Implemented in this PR: the editable diagram specification, generated interactive map, static README preview, landing page, and `main`-only `gh-pages` workflow. The first public deployment remains pending until this change merges and a maintainer enables GitHub Pages for `gh-pages`.
