# Deterministic collection audit, plan and explicit evolution

Issue: #23; completes the missing CLI workflow from #11. Related onboarding: #22.

## Outcome and scope

Provide a local synthetic collection workflow from audit to a reviewable plan,
explicit supported application and verification. Reuse installed package helpers;
the CLI remains an optional adapter and portable skills remain self-contained.
No model, network, dependency installation, implicit setup, task database or
semantic rewriting is introduced. The user authorizes implementation, focused
PRs and merges after their existing review gates.

Add `collection audit`, `collection plan` and `collection evolve`. Use explicit
`--collection` and `--layout` selections consistent with existing catalog commands.
Never select HOME or installed global skills implicitly. Commands only parse and
render; repositories own I/O, validators own closed contracts, and services compose
the use cases. Keep class/file names descriptive and singular layer directories.

## Contract

- Audit inventories selected packages, runs bounded local package validation and
  inspects catalog freshness. Continue across independent invalid packages and
  report actionable categories, coverage, omissions and validation limits. Do not
  impose this repository's aliases or full publication profile on all consumers.
- A plan consumes a selected audit and rechecks its evidence against the current
  selected collection. Distinguish deterministic operations from judgment-dependent
  handoffs. Missing or valid-but-stale catalogs may propose `catalog.sync`; malformed
  catalogs require an explicit handoff and are not silently overwritten.
- Evolution consumes a deliberately selected plan. It previews by default.
  `--apply --snapshot-store <external-directory>` authorizes only supported
  operations explicitly present in that plan. No arbitrary paths, shell commands,
  package scripts or replacement bodies are executable plan inputs.
- Initial supported writes are limited to catalog synchronization. Content,
  licensing, examples, icon design, rename/merge/split and semantic contract changes
  remain evidence-linked authoring/evolution/naming handoffs. The receipt reports
  every remaining handoff; successful catalog synchronization never closes them.

Use bounded closed JSON schemas and the duplicate-aware parser. Plans bind to
layout, an opaque root identity, catalog bytes or explicit absence, and package
inventory/content/mode digests. Changing a body/reference, path, mode, catalog or
collection invalidates the plan. Recompute the expected supported operation and
after-digest; caller-edited claims are not authority to write arbitrary content.
Revalidate before simulation and immediately before mutation. Incomplete coverage,
unsafe files, exceeded shared bounds or unsupported entries block application.
Incomplete inventory also prevents secondary package/catalog scans from restarting
with independent budgets. Uninspected packages report `not_run`; catalog
freshness is unavailable rather than inferred from structural JSON validity.
Exclude reserved `.system` content in global layouts. Do not follow package links
or claim hostile-concurrency confinement.

## Reuse and implementation

1. Use package-owned `validateSkill`/filesystem/contracts for structural validation,
   `skills-catalog` inspect/check/sync/dry-run for metadata and atomic publication,
   and `skills-snapshot` create/verify/restore for recovery. Avoid a parallel catalog
   generator or an invented semantic evolution engine.
2. Add cohesive audit, remediation, filesystem and snapshot adapters plus a closed
   remediation validator. Use injectable process seams and argument-array bounded
   subprocesses when a package exposes only a CLI. Never execute candidate scripts.
3. Register the three descriptive Command classes once in CommandConfiguration.
   Give complete help, JSON output, representative commands and actionable errors.
4. Update source/command instruction indexes, operator documentation and diagrams
   where behavior changes. Keep the existing root/source/command/tests instruction
   hierarchy; no new scoped contract is necessary. Add a concrete Changeset.

## Snapshot and rollback

Snapshot only the selected write preimage. Do not snapshot a whole repository with
Git objects, dependencies or unrelated files. For catalog sync, stage old catalog
bytes and mode, or an explicit absence marker, in a temporary minimal preimage.
Create and verify its snapshot outside the collection, then restore it to a fresh
temporary location to prove byte/mode recovery before writing.

After the stale-plan recheck, perform the existing atomic catalog sync, compare
expected bytes, verify freshness and confirm package fingerprints are unchanged.
On post-write failure, restore only the original catalog bytes/mode or absence and
verify recovery. Preserve snapshots and an inspectable result; never delete other
collection files. If rollback itself fails, report it distinctly and retain the
recovery reference. Initially invalid/stale plans fail before snapshots or writes;
drift discovered during capture preserves the snapshot and prevents the write.
Persist terminal receipts outside the application/rollback transaction. Failure
to confirm the receipt returns a nonzero CLI exit and an explicit persistence
status, while preserving the verified collection outcome and the same outcome in
any already-written terminal receipt. Never trigger rollback solely because the
terminal receipt could not be confirmed.

## Verification

Use disposable synthetic collections and injected failure points. Cover missing
and stale catalogs, independent invalid packages, malformed catalogs, preview
without writes, explicit apply, tampered/duplicate/excessive input, content/mode/
inventory drift, links/hard links/special files, reserved global entries, recovery
corruption, before/after-write failure, and exact byte/mode/absence restoration.
Prove no candidate script, model, network or real-home access. Exercise real CLI
help/arguments and the installed production-only tarball path.

Run Node 24 typecheck, focused suites, `npm run check`, then `npm run package:check`,
Changesets status and whitespace validation. Obtain exact-commit independent review
and matching-head remote checks/Codex review. Local package validation is not the
official Agent Skills validator or behavioral evaluation; report these separately.

Removing these commands and their new adapters reverts the interface without
deleting caller-owned plans, audit reports or snapshots. Publication, releases,
global installations and visibility changes remain separate from this delivery.
