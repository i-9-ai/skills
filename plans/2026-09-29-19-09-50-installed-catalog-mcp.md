# Installed catalog access through the unified MCP

Issue: #21. Related: #17, #20 and the separately tracked lifecycle/history work in #26.

## Objective

Let an agent without native skill discovery find and read this installed collection
through one MCP server. The same catalog operations are available in the existing
CLI. Catalog access must work without a usage database, a Git checkout, a build step
inside a plugin, or knowledge of the caller's working directory.

This is a new externally callable capability, with its own removal path. It does
not replace the installed-hook baseline or its global/project discovery rules.

## Scope and authority

- Resolve the bundled collection from the installed source or distribution module,
  not cwd, global skills or `I9_SKILLS_PROJECT_ROOT`. Keep `.agents/skills` canonical.
- Reuse `CollectionCatalogRepository` and the package-owned catalog validation and
  filesystem contracts. Validate declared identity, catalog freshness and selected
  resource confinement; do not create another catalog format or index database.
- Add read-only search, Markdown resource retrieval and bounded overview operations.
  Expose them through `catalog search`, `catalog read`, `catalog overview`, and the
  same MCP dispatcher that owns explicit observed-read recording and rankings.
- Rename the server-facing responsibility and public command to `mcp serve`, with
  descriptive matching class filenames. Update all controlled consumers and guides;
  do not retain a parallel usage-only server or undocumented compatibility route.
- Delay usage storage selection/opening until an explicit usage request. Protocol
  initialization, tool discovery and catalog reads perform no storage writes.
  Validate record input before creating anything. A ranking request opens existing
  storage read-only; missing or invalid storage is unavailable, not zero history.
- Keep an explicit CLI database option and host-owned plugin data selection. Reuse
  the installed-hook storage confinement rules for plugin state. Do not infer reads
  or activations from catalog retrieval, and do not persist prompts or skill content.
- Update the existing Claude plugin MCP mapping to the common entrypoint. Adding a
  Codex mapping requires verified native format/runtime evidence; absent that proof,
  document the manual CLI path without advertising unsupported registration.

No dependency, automatic setup, global installation, release, npm publication,
marketplace submission or visibility change is part of this delivery. The user has
authorized focused PRs and merges after the required reviews and checks.

## Interfaces and limits

Use closed input objects and reject unknown fields and wrong types:

- `skill_catalog_search`: literal query of at most 200 characters, optional page
  size from 1 to 50 and bounded offset within the existing 256-package catalog
  limit. Return selected metadata, totals and explicit omission/pagination data.
- `skill_resource_read`: cataloged skill name plus a package-relative resource,
  defaulting to `SKILL.md`. Support that entrypoint and Markdown files below
  `references/` only, at most 64 KiB each. Reject absolute paths, traversal,
  links/unsupported entries, encoded path tricks, scripts and unrelated files.
  Never execute a package script to satisfy a read.
- `skill_catalog_overview`: a bounded entry count rendered with the existing
  overview service and a fixed context limit. Preserve truthful omission and
  coverage information rather than cutting entries or required summaries in half.

Bound the serialized response as well as input and resource bytes. Errors use
stable actionable categories without exposing host paths, raw requests or content.
Preserve protocol ordering, backpressure and cancellation behavior from #27.

Return collection identity, package version and catalog/content digests. Keep
declared source refs, independently verified Git revisions and content digests
distinct. A clean installed package does not prove a resolved Git SHA: report it
as unavailable rather than deriving it from a version or hash. Explain this in
the operator guide and test tampered identity, stale catalogs and changed bytes.

## Architecture and instruction map

Retain the current `AGENTS.md` -> `src/AGENTS.md` -> `src/command/AGENTS.md`
hierarchy, plus the existing tests and plans contracts. No new instruction scope
is needed. `config` owns installed paths; `repository` owns bounded collection and
state access; `validator` owns closed query contracts; `service` coordinates catalog
and lazy usage operations; `transport` owns the single MCP protocol lifetime;
`command` only parses CLI input and renders results.

Update the existing source/command indexes and the MCP companion guide for the
renamed entrypoint. Public documentation describes observable capabilities and
limitations. Package procedures remain in their existing skill entrypoints.

## Implementation and verification

1. Add installed collection selection and bounded catalog/resource queries using
   the existing helper. Write unit tests with synthetic collections for identity,
   stale state, path confinement, limits and deterministic provenance.
2. Add the common dispatcher with lazy usage access and migrate the controlled CLI
   and plugin consumers. Exercise real newline-delimited stdio with initialization,
   tool listing, all three catalog tools, explicit usage calls and recovery after
   invalid input; preserve existing transport failure regression coverage.
3. Exercise a clean plugin copy without Git, dependencies or dist, launched from an
   unrelated directory with disposable HOME and absent data variables. Snapshot
   plugin/caller bytes and directories to prove catalog calls create no state.
4. Extend packed-package tests with production dependencies only, an unrelated cwd
   and no access to this checkout. Confirm CLI and MCP resolve the bundled catalog.
   Document version-pinned npx syntax without claiming an unpublished package exists.
5. Add a Changeset covering concrete commands, tools, migration and limitations.
   Run Node 24 `npm run check`, then `npm run package:check` sequentially, Changesets
   status and whitespace checks. Obtain independent review on the exact commit and
   matching-head GitHub checks and Codex review before an authorized merge.

Retain review evidence and test outcomes in the PR and Beads. Structural protocol
tests and native host loading are separate claims; native installation remains #12.

## Rollback

Revert the focused catalog/MCP change and its controlled consumer updates together.
This removes the new read-only interfaces and restores the prior explicit usage
entrypoint without changing catalog files, installed skills or stored usage data.
No migration or deletion is needed for these catalog operations.
