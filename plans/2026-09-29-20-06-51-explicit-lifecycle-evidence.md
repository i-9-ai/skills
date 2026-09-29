# Explicit skill lifecycle and catalog evidence

Issue: #26; completes the explicit lifecycle and catalog-history metrics from #17.

## Objective, scope and authority

Extend the existing opt-in local evidence store with caller-reported routing,
activation and normalized outcomes, complete catalog observations and bounded
queries through the same CLI/MCP. Reads remain read evidence only. No automatic
activation inference, model call, upload, content retention, collection rewrite,
background process, new dependency or task-tracking database is introduced.

The user authorized implementation, focused PRs and merges subject to their review
conditions. Publication, visibility changes and installation in a real consumer
remain outside this change. No native planning mode is available; this plan is
the implementation contract under the portable planning protocol.

## Reuse and architecture

Reuse Node 24 SQLite and the issued checksum-protected migrations. Extract only
the shared database open/close/transaction boundary into a focused
SkillEvidenceDatabaseRepository. Keep SkillReadRepository responsible for read
evidence and its projections. Add SkillLifecycleRepository and
CatalogObservationRepository, reusable validators, a shared service and descriptive
Command classes registered once by CommandConfiguration. Maintain singular layers.

Append migration 3 without changing the SQL or checksums of migrations 1 and 2.
Store canonical envelopes in the existing usage_events namespace and normalized
projections in dedicated tables with period, source, correlation and observation
indexes. Preserve every legacy row; never backfill invented lifecycle events.
Queries are read-only and never create or migrate storage. Preserve existing read
APIs and test both supported earlier schemas and current schema explicitly.

The aggregate catalog helper replaces a derived index and can discard that
index's history. Never point that writer at the evidence database. No migration,
failure recovery or maintenance operation may reset or replace the evidence store.

## Closed evidence contracts

Keep schema 1 unchanged. Schema 2 lifecycle envelopes retain event_id,
correlation_id, occurred_at, source_host, source_adapter and session. Support only
skill.routed, skill.activated, skill.completed, skill.not_applicable,
skill.blocked and skill.abandoned. The payload carries collection, skill, immutable
source identity and a closed reason code. Do not accept prompts, responses, task
titles, arbitrary annotations or unknown fields.

Use canonical lowercase UUIDs/hashes, canonical millisecond UTC timestamps,
64-character slugs, 1,024-character portable package paths, bounded Git refs and an
8 KiB event limit. Provenance has repository, source_ref, resolved_git_sha,
package_path and package_sha256. Null Git fields explicitly mean content-only
identity. A resolved Git SHA requires a repository; a requested ref requires a
resolved SHA. Public HTTPS repository origins reject credentials, queries,
fragments and local/private addresses using the established policy.

Document package_sha256 as SHA-256 over UTF-8-byte-sorted records of
relative-path NUL file-sha256 LF from a bounded regular-file package tree. Never
relabel an entrypoint/resource hash as a package-tree digest. Recording accepts a
caller assertion and does not fetch sources or certify ownership.

Reasons are null for routed/activated/completed; not-applicable uses outside_scope,
prerequisite_mismatch or superseded; blocked uses missing_input,
missing_dependency, permission_required, validation_failed, unavailable_resource
or incompatible_environment; abandoned uses caller_cancelled, superseded or
execution_interrupted. Four outcomes are terminal for one correlated skill
attempt. A resumed attempt gets a new correlation. Freeze immutable source/session
identity per attempt. Accept independently reported stages and out-of-order arrival
without inventing predecessors; reject contradictory stage timestamps and terminal
outcomes. Define same-stage exact replay/conflict behavior explicitly.

Catalog observations use schema 2 and event_type catalog.observed with session
null, collection/source/catalog digest and at most 256 distinct skill members.
Members retain skill, portable package path, package digest and normalized metadata
digest, never bodies, descriptions or local filesystem locations. Bound input to
256 KiB. Explicit empty inventories mean an observed empty collection. Require
increasing observation timestamps per collection except exact replay. Derive
added/changed/removed records against the previous observation transactionally;
an unchanged inventory is still an observation with zero changes. Retain a local
recorded_at receipt timestamp separately from asserted occurred_at.

All old/new record interfaces share the event-ID namespace, including legacy read
rows. Canonically identical retries return recorded:false. Changed evidence,
source/session identity or incompatible outcomes return a redacted
evidence_conflict. Validate completely before opening a writer. Preserve SQLite
BEGIN IMMEDIATE transactions, the busy timeout, migration rollback and unknown
schema rejection.

## CLI and MCP

Preserve existing commands and tools. Extend telemetry record for lifecycle v2;
add telemetry catalog-observe, lifecycle, overlap, inactivity and catalog-history.
Expose equivalent structured MCP tools skill_lifecycle_record,
skill_catalog_observe, skill_lifecycle_metrics, skill_routing_overlap,
skill_catalog_inactivity and skill_catalog_history. CLI owns explicit file/stdin
input; MCP never accepts an arbitrary file/database path in tool arguments.

New queries require a half-open UTC from/until period of at most 366 days and
optional collection/skill filters, default limit 20 and maximum 100. Lifecycle
buckets support total/day/month. History uses a database-assigned stable sequence
cursor. Return explicit bounds, stable ordering and truncation; keep responses
within the existing 1 MiB MCP limit. Preserve existing ranking/trend defaults.

The existing 64 KiB input-line bound is too small for the approved 256 KiB
catalog envelope. Raise the bounded MCP ingress line to 1 MiB while retaining
each tool's smaller validated input cap and the 1 MiB response limit. Verify a
real catalog observation above 64 KiB, identical retry, oversize ingress rejection
before storage and bounded paged recovery for oversized response bodies.

## Metric semantics

- Activations count explicit distinct attempt/skill identities in the period.
- Route conversion uses routed attempts beginning in the period as denominator,
  with a matched activation after routing and before until as numerator.
- Completion/block rates use the activation cohort beginning in the period, with
  a corresponding later terminal outcome before until. Pre-activation blocks are
  reported separately. Return null ratios when denominators are zero.
- Report explicit event counts, distinct attempt counts, unmatched stages and
  normalized reasons without silently substituting one measurement for another.
- Reactivation requires an earlier explicit activation of the same logical source
  and skill; distinguish revision changes. No read-based activity inference.
- Overlap means co-routing correlations for skill pairs, with joint and union
  counts; it does not establish semantic similarity or redundancy.
- Inactivity uses the latest complete catalog observation before until and zero
  explicit activations in the period. Include observation identity/time,
  first-seen evidence and observed_entire_period. Missing catalog evidence returns
  catalog_unobserved. A recent member must not look inactive for a full period.
- Active revision means the latest observed catalog identity, not the latest
  revision mentioned in a lifecycle event.

## Implementation and validation

1. Add strict evidence/query validators and transactional migration/projections.
2. Extract the shared connection boundary while keeping legacy behavior covered.
3. Implement explicit record and bounded query services, then CLI/MCP adapters.
4. Update telemetry/MCP/operator documentation and affected diagrams/instruction
   indexes with actual examples, denominators, privacy and unsupported inferences.
5. Add a concrete Changeset and obtain exact-commit independent review.

Use synthetic disposable databases only. Cover earlier-schema upgrades and exact
checksum preservation, transactional migration failure, newer-schema rejection,
replay/field-order normalization, cross-interface ID conflicts, terminal/source
conflicts, concurrent distinct/identical/conflicting writers and bounded busy
failure. Test every reason combination, input limits and privacy rejection before
writes; exact time boundaries, cross-period cohorts, zero denominators, unmatched
stages and buckets; catalog add/change/remove/re-add/stale input, missing snapshot,
partial-period membership and revision changes. Demonstrate aggregate-index
rebuild/reset leaves evidence intact, CLI/MCP parity, redacted errors, read-only
queries, response limits and existing transport backpressure.

Run focused Node 24 suites, npm run check, then npm run package:check sequentially,
Changesets status and diff checks. Retain exact commit test/review evidence; source
tests do not imply native provider behavior or publication.

## Rollback

The new interfaces can be removed without deleting evidence. Never edit an issued
migration to downgrade a live database. Recovery requires stopping writers and
restoring an explicitly selected caller-owned backup; no reset, prune, overwrite
or silent fallback is provided. Preserve unsupported/newer databases and report
the compatibility failure.
