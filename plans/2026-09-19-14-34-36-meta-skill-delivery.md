# Complete the local meta-skill delivery

## Objective and authority

Complete the authorized meta-skill work behind PR #2 as reviewable local
commits. Research requested to enable an improvement must lead to the supported
implementation. Do not push, publish, merge, change visibility, install into a
consumer, alter home configuration or enable hooks.

The repository contains only procedures whose primary responsibility directly
concerns skills. General domain, tool and execution packages belong in a
separately authorized collection and are excluded from this delivery.

## Scope and sequence

1. Preserve the Node 24 TypeScript/oClif consolidation and its singular source
   layers. Keep one launcher and no superseded command wrappers.
2. Expose collection catalog inspect/check/sync with explicit roots/layouts,
   read-only preview, bounded inputs and idempotence. Aggregate synchronization
   preserves the existing SQLite history and explicit reset boundary.
3. Add separate session configuration/output adapters for the documented Codex,
   Claude Code, Copilot CLI and Gemini CLI contracts around one context service.
   Report the OpenCode plugin adapter and read telemetry for hosts other than
   Claude as unimplemented, with a manual context or observed-read fallback.
4. Apply the reviewed Agent Skills guidance to authoring, design, evaluation,
   evidence collection and optimization. Preserve original wording, immutable
   provenance, self-contained routes and frozen final acceptance. Regulated
   subject research remains available for proposed skills; case-specific
   professional determinations receive a qualified human-validation handoff.
5. Keep the generated local Codex environment file excluded. Explicit setup
   uses npm ci; command startup never fetches or installs dependencies.
6. Prepare the authorized `@i-9-ai/skills` package identity with bin `i9-skills`,
   retaining private true and updating lockfile, pending Changesets and actual
   scoped node_modules tests. Prepare a local packed artifact with a deliberate allowlist. The
   build checks strict types, replaces disposable dist output and emits the
   same TypeScript as JavaScript. The launcher selects source in the checkout
   and built code in node_modules. No runtime compilation is introduced.
7. Test the packed artifact with already installed production dependencies in
   disposable scratch, without registry access or installation. Validation CI
   installs the lockfile explicitly and runs that test without publication.

## Instruction hierarchy

Retain root -> .agents -> skills, root -> src -> command -> hook, root -> tests,
and root -> plans. Package procedures stay in SKILL.md; update the existing
indexes for capability entrypoints. No per-package AGENTS.md or general
operations hierarchy is introduced.

## Acceptance and validation

Run npm run check and npm run package:check on Node 24, Changesets status and
git diff --check. Exercise no-write preview, stale catalogs, history retention,
host payload differences, unsupported-host errors and the packed launcher.
The packed inventory must match the actual source catalog, not a hardcoded
package count. Run the pinned official skills-ref validator on every skill
using the existing verified isolated installation; unavailable execution is
an explicit readiness blocker. Obtain independent review on the final commit.

Separate structural checks, helper/CLI behavior, skill behavioral evaluation,
native host execution and publication. Native host trust and enablement are not
proved by configuration fixtures. No cross-platform runtime certification or
improved activation-rate claim follows from this delivery.

## Rollback and remaining boundaries

Revert a capability's local commit and its index/documentation together.
Configuration generators print data, so rollback needs no home cleanup.
Preserve prior snapshots and recovery artifacts. Keep private true; a release
requires separate registry identity/version and publication authorization.
Before any visibility change, inventory the remote GitHub surfaces separately.
Neither local hygiene checks nor the existing Pages/Wiki workflows authorize
that change.

## Reconciliation refinements

The current-session reconciliation also requires consistent research premises
across design, evolution, evaluation, discovery and synthesis, plus current
collection reevaluation on refactoring. Authoring routes one source directly to
design and reserves synthesis for two distinct contributions. Preserve the
complete useful corpus and sourced regulated information; gate individual
professional decisions separately.

Independent baseline review identified output alias confinement and snapshot
trash confinement defects. Repair them with disposable no-mutation rejection
tests, preserving aggregate history and restorable content-addressed snapshots.
Rollback is a revert of the focused repair; no existing snapshot is migrated or
removed. Exact review and validation evidence stay in the caller's Beads graph.

## Repository-only completion

The later user clarification pauses all unfinished global non-meta work.
Continue this repository's outcomes and retain the global Beads backlog as
deferred; do not close it as part of repository readiness.

Retain the existing instruction hierarchy. Correct the child skill contract and
authoring helper together so an advisory 500-line target cannot displace an
essential procedure or complete example. Keep byte-read safety bounds. This is
an update to existing package policy, not a new instruction scope.

Recheck the current Codex, Claude and Gemini instruction/hook contracts without
launching or configuring a host. Complete the current 23-package responsibility
and icon review. Independent snapshot review also requires special-file rejection
before any blocking read, bounded manifests/objects, and inclusion of the bundled
snapshot suite in the required npm check. Preserve shared-object concurrent
publication and legacy restoration. Revert the focused fix to roll back source;
never rewrite existing snapshot stores to accommodate a validator change.

## Local plugin artifact preparation

Complete Beads outcome i9-skills-2qm.12.2 through `plugin prepare --output`
in the existing TypeScript CLI. Preview is the default; `--write` creates only
a new, explicitly selected staging folder named `i9-skills`. Inspect and bound
all selected source bytes before writing. Refuse existing destinations, linked
or special source files and stale catalogs. Staging rejects hidden-directory
skills/plugins roots, .config namespace discovery roots and .system on both
lexical and canonical paths, including descendants. This deliberately conservative
shape rule also covers additional host names; managed-worktree scratch stays usable.
Canonical source selection accepts real roots below ancestor aliases without
mixing lexical and canonical path coordinates. Reject empty source directories
and validate all prefixed artifact paths before writing, so conversion cannot
silently break a package or defer predictable path failures to partial output.
Retain an incomplete new artifact for inspection if writing fails; never
replace or clean an existing directory.

The artifact contains the catalog's actual packages under `skills/`, licenses,
a deterministic integrity receipt, root Agent Plugins 1.0.0 `plugin.json` and
the supported `.codex-plugin/plugin.json` compatibility manifest. Derive their
shared identity/version from package.json. No new dependency, script execution,
MCP connection, hook registration, host setting or marketplace registration is
introduced. Repository instructions and source code are not plugin contents.

Use the existing source/command/test scopes; no new child instruction contract
is needed. Verify preview, byte-for-byte package inclusion, unsafe inputs,
no-overwrite, manifest contracts and execution from the actual packed package.
Validate the prepared compatibility manifest with the available plugin-creator
validator; validate the portable manifest against the official schema outside
the offline test suite. Local schema conformance does not establish host
installation, UI rendering or marketplace acceptance. Revert the command,
tests and documentation to remove this capability; generated staging artifacts
are caller-owned and are never removed by rollback.
