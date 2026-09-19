# Explicit local skill telemetry

## Objective and authority

Complete the accepted local telemetry capability behind Beads i9-skills-2qm.15:
typed skill observations, stable occurrence/correlation identifiers, explicit
session evidence, rankings/trends and bounded operational logs. Implement and
validate locally; no host registration, remote collection, task ledger,
publication or consumer installation is authorized.

## Current and target instruction map

Retain root -> src -> command -> hook, root -> tests and root -> plans. Source
contracts own the existing singular config, command, service, repository,
validator, migration and transport layers. Add operator documentation and index
links under the existing command and plan contracts; no new AGENTS subtree is
needed. Distributed package procedures remain in SKILL.md.

## Design

Extend the existing dedicated skill-usage SQLite database with a checksum-verified
second migration. Preserve usage_reads and the existing MCP record/ranking
interfaces. A new usage_events table stores closed-schema envelopes for
session.started, skill.read.attempted and skill.read.observed. Successful-read
events project transactionally into usage_reads; attempts never increment reads.
Old explicit MCP observations remain available without fabricated historical
envelopes. Session-start counts and sessions inferred from actual read records
are reported as different measures.

Each new envelope has schema_version, event_type, UUID event_id/correlation_id,
canonical UTC occurred_at, logical source_host/source_adapter/session, and a
strict event-specific payload. Unknown fields, prompt/body/path payloads,
unknown types and conflicting retries fail. Explicit callers allocate random
UUIDs once and reuse them on retry. Host adapters may deterministically map
documented session/tool occurrence IDs to opaque UUIDs for retry identity;
they cannot infer activation or fabricate successful reads from pre-tool events.

Expose noninteractive telemetry record/rankings/trends commands around a shared
service. Record reads one bounded regular JSON file or bounded stdin. Queries
use half-open UTC periods and deterministic limits. Optional JSONL diagnostics
use an explicit caller-owned path, fixed fields and bounded rotation; they
contain categories/IDs rather than input values, prompts or skill bodies.

No dispatcher dependency is warranted: ingestion has one transactional writer
and explicit queries. Native Node 24 SQLite already supplies the required
transactions/migrations, so adding Knex, Drizzle or Kysely would introduce a
second schema mechanism without an evidenced consumer benefit.

## Sequence and validation

1. Add strict envelope validation and a migration preserving original checksum.
2. Implement transactional retries/read projections and bounded trend queries.
3. Add caller-owned input/log repositories and CLI services/commands.
4. Verify each host's official success-event contract before implementing an
   adapter; unsupported or ambiguous payloads use explicit record/manual context.
5. Test migration preservation, retry conflicts, attempt/read separation,
   multiple sessions, period boundaries, input/file/log limits, symlink rejection
   and CLI stdout discipline using disposable fixtures.
6. Run Node 24+ npm check, packed package checks, Changesets, official validation
   for changed packages and exact-commit independent review.

## Rollback and limits

The schema upgrade is additive and transactional. Retain the previous database
before adopting a new binary. Older binaries reject newer migration history;
rollback requires restoring that caller-owned pre-upgrade copy or continuing
with the new reader. Never delete rows or downgrade the ledger to silence the
version check. Revert command/docs together when removing the capability.

Input evidence is a caller assertion whose truth must be established by the
emitter. Tests verify storage/protocol behavior, not native host enablement or
complete measurement coverage. No task status is stored in SQLite.
