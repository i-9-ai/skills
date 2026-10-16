# Global skills in the local panel

Related: issue #106 and draft PR #107. The operator requests their explicitly
selected global skill collection alongside the repository's private pilot copies.

## Outcome and scope

Add an optional `--panel-global-collection` to the existing shared MCP. Discover
the selected and global sources through the existing bounded discovery helper,
exclude `.system`, deduplicate actual package paths, and retain same-name packages
at distinct paths. Give entries stable source-qualified identities and visible
origin labels. Paginate the protocol response and load all available pages in
the panel, with search and source filtering over the combined catalog.

Global references are read-only: inspect their actual bounded SKILL.md bytes and
prepare an unsent review request. Candidate retention, apply and recovery remain
restricted to the original explicitly selected editable collection. No copy of
global packages enters the repository or private collection. No global catalog,
setup, scripts, telemetry or host hooks are written or executed by discovery.
Full YAML parsing for optional global references reuses the existing declared
production YAML dependency in a prepared runtime. Selected-only plugin discovery
retains its dependency-free portable parser; no new dependency is added.

## Instruction map

Keep root → src → command, root → tests, root → plans and root → website.
Existing documentation guidance remains in .agents/references/public-documentation.md.
No new instruction boundary is needed. Update existing source/plan indexes for
the catalog repository and this recipe; package entrypoints stay unchanged.

## Implementation sequence

1. Add synthetic regression cases for global discovery, nested and linked
   packages, duplicate names, read-only inspection, paging and rejected mutation.
2. Add a catalog repository, explicit configuration and shared CLI/plugin flags.
   Never accept an arbitrary client file path as an inspection selector.
3. Add source labels/filter, paged loading and truthful read-only inspection and
   review behavior to the existing UI. Keep unresolved-write guards intact.
4. Update operator docs, the pending Changeset and EN/PT-BR/ES candidate-only
   website copy. No newly advertised production/native availability.
5. Run explicit npm ci, targeted tests, full checks, package checks and diff checks.
   Obtain independent exact-commit review and update the same draft PR.
6. Update only the private lab through its supported installer with the expressly
   authorized global path. Verify its actual catalog and browser behavior without
   applying/recovering a change, restarting Codex or killing existing processes.

## Acceptance and retained evidence

Tests use disposable synthetic homes and never the operator's real home. Verify
that two equal names remain addressable, aliases to the same package deduplicate,
refresh sees new metadata, missing/broken sources report limited coverage, hidden
system skills stay excluded, and unknown or stale global selectors are refused.
Read-only selections must not create proposal state or expose an editable base.
Global references and selected candidate state remain byte-identical after the
operator demonstration. Record discovery counts/warnings without publishing
private names, source text or absolute paths. Native process refresh and native
resource acceptance remain distinct from a loopback browser bridge.

Write authorization must resolve existing physical destination leaves, including
filesystem case aliases, and derive external reference boundaries independently
of metadata success. Walk ordinary global directories with a 32-level/16,384-entry
bound, protect linked targets without traversing external repositories, and fail
closed for writes on incomplete boundary coverage. Preserve available read-only
catalog entries and warnings. Regression cases include invalid YAML, ancestral
aliases, destination case aliases, BOM byte identity and incomplete coverage.

## Authority and removal

The request authorizes reading the named global collection for this local panel
and updating the existing private lab, not global package edits or publication.
No new dependency, external service, public host or model execution is added.
Remove the optional flag from the lab to restore the selected-only view; revert
the focused code/UI changes for a source rollback. Preserve existing private
proposals and packages. No cleanup deletes global skills or retained evidence.
