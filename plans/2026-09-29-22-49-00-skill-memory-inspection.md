# Skill memory inspection

## Objective and authority

Implement [issue #48](https://github.com/i-9-ai/skills/issues/48), the compact
summary and retention-inspection portion of the Skill Memory proposal in #11.
The caller receives a bounded, inspectable report from the existing dedicated
evidence database. The parent task owns Git, Beads, common documentation indexes,
full validation and independent exact-commit review. This plan is the durable
planning record; no native planning-mode transition is available in this turn.

## Scope and exclusions

- Add `skills memory summarize` and `skills memory retention` through the explicit
  command registry, with required existing absolute database, logical collection,
  UTC `[from, until)` window and optional skill.
- Reuse the verified read-only connection, schema and lifecycle/catalog
  projections. Compose a consistent read snapshot; retain existing public query
  contracts when exposing a narrow projection seam for reuse.
- Keep weak name/revision read receipts separate from source-qualified lifecycle
  identities. Report source collisions and unsupported receipt categories without
  inventing validation, approved decisions, limitations or migration evidence.
- Inspect an optional caller cutoff within the window. Report `policy_not_supplied`
  when absent. Counts describe evidence, never deletion eligibility or approval.
- Add focused synthetic tests, a self-contained operator document and Changeset.

No new dependencies, schema, store, event types, MCP tools, host hooks, automatic
recording, home discovery, policy persistence, deletion, pruning, vacuum,
installation, publication, visibility changes or external research are included.
`telemetry record` and `telemetry catalog-observe` remain the recording interfaces.

## Design and bounded inputs

Use erasable TypeScript classes in the existing singular command, service,
repository and validator layers. Commands parse and render; the service validates
before storage access; the repository owns SQL and snapshot composition.

Require canonical UTC dates and a positive window of at most 366 days. Require a
logical collection and validate the optional skill using existing evidence rules.
Accept only declared input fields. Results default to 20 entries per section and
allow at most 100. Limit each period scan to 5,000 rows before selective filtering
can hide work, and preserve catalog's 256-member bound. Bound serialized output to
64 KiB; return an explicit cap error rather than silently omit evidence. Keep
ordering deterministic and mark limited result sections as truncated.

Lifecycle counts and ratios retain explicit denominators and pre-window attempt
context. Reads remain name/revision-scoped; mirrored read projections must not be
counted twice. Catalog history and inactivity report their coverage and observation
limits. Omit session/correlation IDs, raw envelopes, content and free text from
reports. A blocked `validation_failed` reason is not an official validation receipt.

Retention uses event time with an inclusive cutoff on the retained side. It reports
counts and date bounds for relevant evidence within the selected window. All
outside-window history and cross-family retention dependencies remain explicitly
unassessed. A missing cutoff is an absent policy, not permission to choose a default.

## Implementation sequence

1. Add a closed query/output validator and read-only memory service.
2. Add bounded repository projections, composing existing lifecycle/catalog logic
   in one snapshot through the smallest compatible reuse seam.
3. Add both command classes and explicit registrations with help and examples.
4. Add deterministic synthetic fixtures and focused unit/CLI coverage.
5. Document interfaces, limits, recovery and evidence boundaries; add a Changeset.
6. Run focused tests and formatting/type checks appropriate to these files, report
   exact changed files and evidence, and leave final integration/review to parent.

## Acceptance and verification

- Isolate each fixture in a disposable directory; use only existing local tools.
- Test same-name source collisions, revision separation, selected-skill isolation,
  pre-window attempt evidence and stable ordering.
- Test exact cutoff boundaries, missing policy, mirrored-read deduplication and
  out-of-window/unsupported-receipt disclosure.
- Test missing/old/unsupported storage without creation or upgrade, invalid input,
  unknown flags including `--apply`, row/result/byte caps and source safety.
- Hash database bytes and inspect fixture files before/after read operations.
- Run the new unit and CLI suites with Node.js 24, the pinned formatter for touched
  source/tests, and `git diff --check`. Parent runs full checks and Changeset/link
  validation on the integrated exact commit; no skill package changes require a
  new semantic or provider evaluation claim.

## Rollback and retained evidence

Remove the new command registrations, new implementation/tests and delivery docs
as one feature; revert any additive projection seam without altering stored data.
No database rollback is needed because these commands never write or migrate it.
Retain the focused check results and exact-commit independent review in the PR.
