# Skill Memory

`skills memory summarize` returns a compact report of recorded skill evidence.
`skills memory retention` inspects that evidence against an optional caller cutoff.
Both commands read the existing dedicated evidence database in one consistent
snapshot and print JSON to stdout. They never create or upgrade a database, record
an event, persist a policy or delete history.

This implements the summary and inspection portion of
[issue #48](https://github.com/i-9-ai/skills/issues/48). The existing
`telemetry record` and `telemetry catalog-observe` commands remain the recording
interfaces. There is no second memory store, transcript capture or background
collection.

## Invocation

Use Node.js 24+ and an already prepared local CLI. Replace `i9-skills` with
`node bin/index.mjs` when running from a prepared source checkout. Select an
existing absolute database path, a logical collection and canonical UTC dates:

```sh
i9-skills skills memory summarize \
  --db /data/evidence.db --collection demo --skill example-skill \
  --from 2026-09-01T00:00:00.000Z --until 2026-10-01T00:00:00.000Z \
  --limit 20

i9-skills skills memory retention \
  --db /data/evidence.db --collection demo \
  --from 2026-09-01T00:00:00.000Z --until 2026-10-01T00:00:00.000Z \
  --cutoff 2026-09-15T00:00:00.000Z
```

`--skill` is optional. Collection and skill selectors are bounded lowercase slugs.
The window includes `--from` and excludes `--until`; it must be positive and at
most 366 days. A cutoff must satisfy `from <= cutoff < until`. An occurrence
exactly at the cutoff belongs to `at_or_after_cutoff`.

Omit `--cutoff` to inspect the inventory without choosing a retention threshold.
The report then returns `policy.status: "policy_not_supplied"` and null partitions.
With a cutoff, it returns `policy.status: "inspected"`; `persisted` and
`deletion_authorized` remain false. There is no `--apply`, delete or vacuum mode.

## Reading a summary

The report separates evidence with different identities and meanings:

- `lifecycle` preserves source and revision identities, explicit event/reason
  counts, attempt counts and ratios with their numerators and denominators. Source
  information is a caller assertion, not independently verified provenance.
  Bounded earlier attempt evidence supports cross-window cohorts; an earlier route
  is not added to the selected window's route count.
- `lifecycle_source_collisions` discloses names associated with multiple recorded
  sources in the selected window. Its counts use the complete bounded lifecycle
  selection even when displayed lifecycle rows are limited. Further collision
  rows also carry an explicit truncation flag.
- `read_observations` groups weaker receipts by collection, skill name and recorded
  revision. Read/session counts never imply activation and are never assigned to
  a source-qualified identity by name alone. A typed observed-read envelope and
  its stored read projection count as one read.
- `catalog_history` shows bounded observation headers and their collection-wide
  added/changed/removed counts. With a skill filter, only observations that changed
  that skill appear; the header's delta counts still describe the complete
  collection observation. `catalog_inactivity` uses the latest complete observation
  before `until`, including a possible earlier baseline, and exposes the existing
  first-seen coverage flag. Absence of reported activation is not proof of non-use.
  Without a complete observation, its status is `catalog_unobserved`.

The current schema does not store approved decisions, official validation
receipts, known-limitations receipts or approved migration receipts. These
categories return `not_recorded`. A `validation_failed` caller reason and an
observed catalog change do not establish those missing receipts. Reports omit
session/correlation identifiers, raw envelopes, skill content and free text.

## Reading retention inspection

Retention reports count logical occurrences within the selected window, with
first/last event timestamps and optional before/at-or-after-cutoff partitions.
The occurrence families are the six explicit lifecycle types, complete catalog
observations, observed reads and explicit read attempts. Mirrored envelopes and
catalog member/delta rows are not counted again as separate occurrences.

For a selected skill, a catalog observation is relevant when it contains that
member or a recorded change for the skill, including removal. This differs from
summary history's changed-skill filter. Session-start events have no collection
identity and remain explicitly unattributed. Timestamps are recorded event-time
assertions; the inspection does not authenticate them.

All history outside the selected window remains unassessed. Dependencies involving
attempt closures, catalog baselines/deltas and shared session receipts remain
unassessed too. A count before the cutoff is not a list of rows safe to delete.
The report does not estimate reclaimed storage or infer an approved policy.

## Limits and recovery

| Limit | Behavior |
| --- | --- |
| Input | Closed query fields, at most 4 KiB; the absolute database path is independently bounded to 4 KiB. |
| Time | Canonical UTC timestamps with milliseconds; positive window of at most 366 days. |
| Scan work | At most 5,000 rows per period scan, with the existing bounded attempt/source probes and at most 256 catalog members. |
| Legacy scans | Read receipts and retention event headers are capped across the entire database window before collection/skill filtering, because their existing indexes are time-based. |
| Display | Default 20, maximum 100 entries per section; aggregate counts and collision disclosure use the full bounded selection. |
| Output | At most 64 KiB of serialized JSON; an oversized result fails explicitly. |

`truncated` indicates omitted display rows; it does not turn an incomplete display
into a complete report. Retention's overall counts remain complete for the bounded
selection even if its family display is limited. Narrow the window or skill to
inspect a smaller selection, or increase `--limit` within the stated bounds.

`query_limit_exceeded` requires a smaller window or applicable scope. Reducing a
display limit does not lower scan work. `response_too_large` requires a smaller
display or selection. `schema_upgrade_required` leaves an older database untouched;
use an explicitly selected compatible writer/upgrade workflow before trying again.
`storage_unavailable` requires checking the existing file, its canonical parent
and supported evidence schema. Inspection never repairs, replaces or migrates it.

## Disposable example

This example explicitly records one synthetic activation in a new temporary
database, then inspects it. The two memory commands themselves perform no writes.
Keep or remove the temporary fixture according to the caller's cleanup policy.

```sh
example_dir="$(mktemp -d)"
example_dir="$(cd "$example_dir" && pwd -P)"
cat > "$example_dir/activation.json" <<'JSON'
{
  "schema_version": 2,
  "event_type": "skill.activated",
  "event_id": "00000000-0000-4000-8000-000000000001",
  "correlation_id": "00000000-0000-4000-8000-000000000002",
  "occurred_at": "2026-09-15T00:00:00.000Z",
  "source_host": "manual",
  "source_adapter": "example",
  "session": "00000000-0000-4000-8000-000000000003",
  "payload": {
    "collection": "demo",
    "skill": "example-skill",
    "source": {
      "repository": null,
      "source_ref": null,
      "resolved_git_sha": null,
      "package_path": "skills/example-skill",
      "package_sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    },
    "reason": null
  }
}
JSON
i9-skills telemetry record --db "$example_dir/evidence.db" --file "$example_dir/activation.json"
i9-skills skills memory summarize --db "$example_dir/evidence.db" --collection demo \
  --from 2026-09-01T00:00:00.000Z --until 2026-10-01T00:00:00.000Z
i9-skills skills memory retention --db "$example_dir/evidence.db" --collection demo \
  --from 2026-09-01T00:00:00.000Z --until 2026-10-01T00:00:00.000Z \
  --cutoff 2026-09-15T00:00:00.000Z
```

The summary has one explicit activation, no inferred completion, weaker read count
zero and `catalog_unobserved`. Retention counts the activation once on the
at-or-after-cutoff side. See [Lifecycle Evidence](https://github.com/i-9-ai/skills/wiki/Lifecycle-Evidence) for the
existing recording contracts and [Skill Telemetry](https://github.com/i-9-ai/skills/wiki/Skill-Telemetry) for legacy
read evidence.
