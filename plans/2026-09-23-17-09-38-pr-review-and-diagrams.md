# PR review corrections and architecture diagrams

## Objective

Resolve the nine actionable comments on [PR #2](https://github.com/i-9-ai/skills/pull/2) at `4cd2dc0` and make the public diagrams accurately describe the implemented skill pipeline and repository tooling. Track delivery in Beads `i9-skills-2qm.20`.

The final reconciliation also paginates all historical review discussions and
checks each against the delivered implementation. An outdated line is not proof
of a fix: retain a concrete code, regression-test, or superseded-interface
explanation before resolving its discussion. Preserve the repository-root
plugin layout while correcting any remaining package-helper defects, and refresh
the PR description from the final capabilities and validation evidence.
Track this final pass in Beads `i9-skills-2qm.21`.

For icon provenance, compare bundled paths with the existing pinned Material
Icons revision and retain package-local source receipts. Use the already
available `rsvg-convert` only to regenerate PNGs from their unchanged SVG
geometry, recording its version, invocation and paired SHA-256 values. Runtime
validation checks these receipts without installing a renderer. Replace the
visual guide's unpinned font payload with the same family's variable font from
a reviewed immutable Google Fonts revision, retain its OFL notice and refresh
the source/artifact receipt after review. These are publication-input repairs,
not changes to plugin manifests or consumer installation.

## Scope and boundaries

Change the affected parser, validators, CLI and plugin preparation, aggregate query, tests, Wiki workflow, and the README and architecture diagrams. Preserve the existing routes and package formats unless a review finding requires a documented correction. The interactive entry-path map remains a high-level route selector; update its source and generated artifacts only if its existing claims become false. Do not merge, publish, release, install into a consumer, or change repository visibility.

The user subsequently selected title-cased Markdown filenames with spaces for the public `docs/` pages and `Home.md` as the single documentation/Wiki entrypoint. Rename only those pages, update inbound links and Wiki assertions, and leave the web asset `docs/assets/index.html` and package-local reference filenames unchanged.

The follow-up Wiki request adds a global, separately owned `github-wiki` skill outside this repository. In this repository, verify `has_wiki` before mirroring and exclude any `AGENTS.md` in `docs/`, including stale copies in the Wiki. The existing Wiki repository class performs the mirror with Node built-ins, so disposable local fixtures verify behavior without additional shell tools. Actual Wiki publication still occurs only on the existing main-branch workflow after merge.

## Implementation and rollback

1. Reproduce each comment in a synthetic fixture and correct the smallest owning component.
2. Refresh diagrams from the verified implementation, including the zero/one/multiple discovery branches and repository CLI boundaries.
3. Review the complete diff and its Changeset, validate on Node.js 24, run the official skill validator for each changed package, and obtain independent review of the exact commit.
4. Push the reviewed commit to the existing PR branch and check its comments and workflows on that SHA.

Revert the focused commit if the correction fails or the diagrams cannot be reconciled with the implementation. Keep Beads open until the pushed SHA and checks provide closure evidence.

## Acceptance evidence

- All nine review comments have a fix or explicit evidence-based disposition.
- Markdown link and fence cases, PNG reserved bit, required plugin assets, malformed maintenance intervals and contradictory targets, packed `validate` behavior, and query bounds have regression coverage.
- README and architecture diagrams show the implemented route and branch behavior without contradicting the interactive overview.
- `npm ci`, `npm run check`, `npm run changeset:status`, `git diff --check`, and official `skills-ref validate` pass as applicable. PR checks pass on the pushed head; review feedback is checked again.
