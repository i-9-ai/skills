# Routing decision collection

## Objective

Collect an explicit skill selection as one atomic decision and expose its
co-routing pairs through the existing overlap query. The user requested this
change after the local evidence store contained reads but no routed events.
No matching open issue was found during initial inspection.

## Scope and authority

Add `telemetry route` and `skill_routing_record` over one shared service. Accept
an opaque decision UUID, session UUID, fixed occurrence timestamp, host/adapter
labels and 1–24 explicitly selected local package paths with collection labels.
Inspect selected package bytes inertly and emit schema-2 `skill.routed` events
with one correlation ID and deterministic per-member event IDs. Keep reads and
activation evidence independent. Add collection guidance to the existing skill
overview, operator documentation, release intent and localized website copy.

The request authorizes repository implementation and disposable end-to-end
verification. Consumer installation, host configuration changes, publication,
external messages and historical event backfills require separate authority.
No dependencies or database migrations are needed.

## Implementation and recovery

The current and target instruction hierarchy is `AGENTS.md` → `src/AGENTS.md`
→ `src/command/AGENTS.md`, with sibling `tests/AGENTS.md`, `plans/AGENTS.md`
and `website/AGENTS.md` contracts. Retain each boundary. Update the existing
source, command, test and plan indexes to expose this collection entrypoint and
its observable verification. The existing lifecycle operator guide owns the
complete invocation and recovery procedure. Restore these index entries with
the implementation when reverting the change.

1. Validate the complete bounded decision before selecting storage.
2. Resolve each selected package and fingerprint its complete inert file tree
   with existing package inspection. Retain logical identities and hashes only.
3. Commit all members in one existing lifecycle transaction. Reject conflicting
   retries and changed membership. Preserve existing single-event callers.
4. Expose CLI and MCP entrypoints, and tell the routing caller when to record.
5. Exercise real CLI/MCP processes against disposable packages and SQLite files,
   including retries, concurrent writers, invalid inputs and atomic rollback.

Revert this change to remove collection entrypoints and guidance. Preserve all
existing evidence. Previously collected schema-2 events remain queryable.

## Acceptance and verification

- Two selected skills create exactly two routed events with the same
  correlation, distinct deterministic event IDs and no read/activation rows.
- Repeating or reordering the same decision records no additional events.
- A separate single-skill decision yields joint=1, union=2 and overlap=0.5.
- Invalid selections and conflicting membership leave no partial route.
- CLI and MCP share results and select the existing default/explicit database.
- Session overview asks for recording only after an explicit selection. Startup,
  discovery, reads, ambiguous shortlists and a `none` route create no routes.
- Run focused integration/regression tests, explicit `npm ci`, `npm run check`,
  `npm run changeset:status`, packaging checks and `git diff --check` on Node 24+.
- Obtain independent review on the exact implementation commit and correct
  pertinent findings. Report automated integration coverage and any untested
  native host behavior distinctly.
