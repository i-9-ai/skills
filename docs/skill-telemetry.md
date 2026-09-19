# Local skill telemetry

The CLI stores explicit observations in one caller-owned SQLite usage database.
It separates a session start, a read attempt and a successful read. None proves
that a model followed a skill, and a missing observation does not prove non-use.
No command installs hooks, sends data remotely or tracks task status.

## Record one observation

Create an existing local data directory with access limited to its owner. Select
the database explicitly; the parent must be an absolute canonical path. Use
Node.js 24+ and the prepared checkout or packed CLI. Write `event.json`:

```json
{
  "schema_version": 1,
  "event_type": "skill.read.observed",
  "event_id": "095db0cf-bd65-4c57-a7e4-757143ab3421",
  "correlation_id": "5cb9910e-6e44-40cb-9cd1-de5b807f250d",
  "occurred_at": "2026-09-19T12:00:00.000Z",
  "source_host": "manual",
  "source_adapter": "cli",
  "session": "opaque-random-session",
  "payload": {
    "collection": "demo",
    "skill": "skill-authoring",
    "revision": "unknown"
  }
}
```

```sh
node bin/index.mjs telemetry record --db /absolute/local-data/usage.db --file event.json
node bin/index.mjs telemetry record --db /absolute/local-data/usage.db --file - < event.json
node bin/index.mjs telemetry record --db /absolute/local-data/usage.db --file event.json --log-file /absolute/local-data/telemetry.jsonl
```

Allocate a new UUID once per occurrence. Reuse that event ID and unchanged
evidence for retries; the response reports `recorded: false` for an identical
retry and rejects conflicting evidence. A correlation UUID connects related
attempt/observation events, which have distinct event IDs. Use opaque session
tokens and logical collection/skill/revision identifiers, never names of users,
tasks, directories, URLs or prompts. Use `revision: "unknown"` when the emitter
cannot prove the revision actually read.

`session.started` has an empty `payload: {}`. Both `skill.read.attempted` and
`skill.read.observed` require the three payload identifiers shown above. Only a
completed successful read justifies `skill.read.observed`; a pre-tool event or
command mentioning a filename justifies no more than an attempt. The explicit
CLI trusts its emitter's assertion; it cannot authenticate the observation.

Events accept only the documented fields, canonical lowercase UUIDs and UTC
timestamps ending in milliseconds plus `Z`. Host/adapter names are bounded
lowercase slugs; other identifiers use bounded ASCII letters, digits, dots,
colons, underscores and hyphens. Files/stdin are limited to 8 KiB of strict
UTF-8 JSON. Duplicate keys, malformed input, linked files and unknown fields
are rejected before opening the database. A regular event file must have one
hard link; it is never modified.

## Inspect counts and trends

```sh
node bin/index.mjs telemetry rankings --db /absolute/local-data/usage.db --from 2026-09-01T00:00:00.000Z --until 2026-10-01T00:00:00.000Z --limit 20
node bin/index.mjs telemetry trends --db /absolute/local-data/usage.db --interval day --limit 30
node bin/index.mjs telemetry trends --db /absolute/local-data/usage.db --interval month --limit 12
```

Queries open an existing supported database read-only: they neither create nor
upgrade it. Periods include `from` and exclude `until`; omitted bounds cover the
full supported timestamp range. Rankings group all revisions by collection and
skill, return successful reads plus distinct read sessions, and break ties by
collection/skill. The limit is 1–100 (default 20).

Trend rows are newest first, contain only occupied UTC day/month buckets, and
report `reads`, `read_sessions`, `attempts`, `session_starts` and
`started_sessions`. A session that read several skills counts once within a
bucket. Session-start occurrences and distinct sessions with an explicit start
remain separate. The limit is 1–366 (default 90); `truncated` reports more
occupied buckets. Counts are usage signals, not quality scores. Historical
MCP reads contribute to read metrics without fabricated session starts.

## Storage, logs and failures

Migration 2 adds typed events without changing migration 1 or its read rows.
The event and successful-read projection commit in one transaction. Concurrent
writers use SQLite's five-second busy timeout. Keep the usage database separate
from catalog databases; unrelated tables, unknown migration versions and
altered migration checksums are rejected. There is no reset fallback, task
ledger, retention pruning or automatic backup. Back up the database while
writers are stopped before an upgrade; older binaries reject newer schemas.
Rollback uses that caller-owned backup rather than dropping new rows.

Optional JSONL logs contain only timestamp, level, component, category and
event/correlation UUIDs. They rotate at 1 MiB, retaining three archives; only
the selected file and `.1`–`.3` are affected. Links and non-regular destinations
are rejected. The directory must be an existing canonical absolute path. New
files use mode 0600; pre-existing permissions remain caller-owned. Use a stable
trusted directory: path inspection does not promise race-proof confinement or
cross-process log rotation. SQLite remains the authoritative event store.

A successful database commit with a failed diagnostic write returns
`log: "unavailable"`; retrying with a new event ID would double count. Malformed
events and storage failures return nonzero. Logs never contain exception text,
input payloads, file paths or skill bodies. Native host coverage and registration
are separate from [host contracts](host-hooks.md); the [MCP interface](skill-usage-mcp.md)
retains its explicit legacy read protocol.
