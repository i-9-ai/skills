# Skill Quality

`skills quality record` explicitly records one quality receipt for one selected
skill revision. `skills quality inspect` reads the recorded receipts from the
existing evidence database. The equivalent MCP tools are `skill_quality_record`
and `skill_quality_inspect`. They share the same validation and storage behavior.

Use Node.js 24+ and a reviewed checkout or prepared installed CLI containing these
commands. Replace `i9-skills` with `node bin/index.mjs` in a prepared source checkout.
Published npm version `0.3.4` does not include these commands or the observation
flags below; use the reviewed candidate until a separately authorized release.
Neither quality command executes a skill, benchmark case, evaluator or official validator,
installs an integration, changes a package or publishes a result.

A successful record means valid metadata was stored or an identical event was
retried. It can contain `fail`, `blocked` or `not-run`; exit status zero does not
mean that a skill passed. Reading instructions, reporting activation or completion,
and observing a catalog change never manufacture quality receipts.

## Choose the evidence boundary

| Recording input | Stored assurance | What remains unverified |
| --- | --- | --- |
| Closed metadata event, with optional `--package-root` byte checking | `caller_assertion` | Whether the declared validation or evaluation happened, the artifact claims, grading, metrics, executor and source Git identity. |
| Closed behavioral event plus an explicit retained `--benchmark` directory | `verified_retained_benchmark` | Executor/model authenticity, grading, metrics, declared fresh contexts, source Git identity, causal improvement and general effectiveness. |

A supplied `assurance` field is rejected. Hashing a package or importing JSON
containing an observed-process label cannot select another assurance. The
`official_validation` kind is available for caller-reported metadata, but this
recording interface does not run or observe the official process. An official
receipt imported from elsewhere remains a caller assertion.

`verified_retained_benchmark` means the server verified the complete frozen
suite/package inventories, run JSON, run receipts and retained artifact bytes.
It does not authenticate a coherently rewritten collection of files or the
assertions inside those files. No assurance is an official conformance,
publication-readiness or statistical-effectiveness guarantee.

## Record a complete inert assertion

Save the following as `receipt.json`. It describes a synthetic evaluation that
was not run, with both expected run arms missing. The repeated `b` and `c` digests
are synthetic caller assertions, not measured package or artifact hashes. The
artifact locator is inert; metadata-only recording does not open or verify it.

```json
{
    "schema_version": 2,
    "event_type": "skill.quality.recorded",
    "event_id": "10000000-0000-4000-8000-000000000001",
    "correlation_id": "10000000-0000-4000-8000-000000000002",
    "occurred_at": "2026-09-19T12:00:00.000Z",
    "source_host": "manual",
    "source_adapter": "example",
    "session": null,
    "payload": {
        "collection": "demo",
        "skill": "example-skill",
        "source": {
            "repository": null,
            "source_ref": null,
            "resolved_git_sha": null,
            "package_path": "packages/example-skill",
            "package_sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        },
        "kind": "behavioral_evaluation",
        "method": {
            "name": "external-evaluation",
            "version": null,
            "revision": null,
            "source_sha256": null
        },
        "result": "not-run",
        "coverage": {
            "expected_pairs": 1,
            "imported_runs": 0,
            "missing_runs": 2,
            "paired_cases": 0,
            "declared_agent_pairs": 0,
            "declared_controlled_agent_pairs": 0,
            "fixture_runs": 0,
            "manual_runs": 0,
            "unexecuted_runs": 0,
            "critical_failures": 0,
            "treatment_critical_failures": 0,
            "comparison_status": "incomplete",
            "selected_cases": [
                {
                    "case_id": "synthetic-case",
                    "phase": "exploratory",
                    "attempts": 1,
                    "joint_workflow": false
                }
            ],
            "treatment": {
                "expected": 1,
                "executed": 0,
                "blocked": 0,
                "not_run": 0,
                "missing": 1,
                "passed": 0,
                "failed": 0,
                "unresolved": 0
            }
        },
        "artifacts": [
            {
                "locator": "evaluation/result.json",
                "sha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
                "scope": "evaluation_artifact"
            }
        ],
        "limitations": []
    }
}
```

Choose an absolute dedicated database outside the installed collection, the
command's caller workspace and any selected package/benchmark tree:

```sh
i9-skills skills quality record \
  --db /data/evidence.db --file receipt.json
# The same event can be supplied on stdin:
i9-skills skills quality record \
  --db /data/evidence.db --file - < receipt.json
```

The response contains `recorded`, `event_id`, `event_type`, `assurance` and
`identity_key`. Repeating this exact canonical event returns `recorded: false`.
Changed content under the same event ID, or an ID already used for a read,
lifecycle or catalog occurrence, returns `evidence_conflict`. A new observation
needs a new UUID, even when it concerns the same revision. Earlier failed,
blocked and missing evidence stays recorded.

File-backed input must be a stable canonical regular file with one link. Its
identity is rechecked before storage preparation, and it cannot occupy or alias
the database or any SQLite `-journal`, `-wal` or `-shm` path. Safe siblings and
relative input names remain valid; stdin has no selected file. Valid recording
can create safe missing database parents without changing the input file.

The event and payload are closed: unknown fields fail. Collection, skill,
source host/adapter and method names are bounded lowercase slugs. Use canonical
UTC timestamps with milliseconds and opaque UUIDs, with `session: null`.
Unknown source/method information is `null`, not an invented revision.
A non-null source repository must be a public HTTPS URL without credentials,
query or fragment. A source ref requires a declared resolved Git SHA and
repository. The package path and artifact locators are portable relative paths.

Method fields are `name`, `version`, `revision` and `source_sha256`. Artifact
fields are `locator`, `sha256` and `scope`; supported scopes are `official_result`,
`benchmark_manifest`, `benchmark_run`, `evaluation_artifact` and
`comparison_summary`. Metadata-only scope labels do not verify those artifacts.
`limitations` uses the documented codes returned by the interface; arbitrary
prose is rejected. The server adds mandatory assertion and inference limits.

Supported codes are `caller_assertion`, `source_identity_asserted`,
`artifact_locator_inert`, `validator_authenticity_unverified`,
`behavior_not_assessed`, `grading_asserted`, `executor_asserted`,
`metrics_asserted`, `joint_workflow`, `comparison_incomplete`, `fixture_evidence`,
`manual_evidence`, `acceptance_is_phase_label`, `historical_revision`,
`reported_budget_overrun` and `retained_run_limitations`. These codes describe
limits; supplying one does not establish an observation or quality tier.

For `official_validation` metadata, replace behavioral coverage with the closed
counts `selected_packages: 1`, `executed`, `blocked`, `not_run`, `passed` and
`failed`. All other counts are 0 or 1; `executed = passed + failed` and
`executed + blocked + not_run = 1`. The result must agree with those counts.
This consistency check is not observation of an official execution.

## Associate a receipt with exact bytes

`source.package_sha256` identifies the full selected package tree, including
references, assets, scripts and other regular resources. The shared benchmark
representation sorts portable relative paths by UTF-8 bytes and hashes each
`path NUL file-sha256 LF` entry. It does not execute scripts or interpret the
resources as instructions.

When recording an actual metadata observation, `--package-root` optionally
checks that this full inert inventory matches the declared package digest:

```sh
i9-skills skills quality record \
  --db /data/evidence.db --file actual-receipt.json \
  --package-root /inputs/example-skill
```

The synthetic `b` digest above will not pass this check for an unrelated real
package. Unsafe links, hardlinks, special entries, oversized trees or detected
changes fail before database selection. Keep selected inputs stable; the
inspection does not promise confinement against hostile concurrent mutation.
Successful byte checking still records `caller_assertion`.

The normalized identity formulas match existing lifecycle evidence:

```text
source_key = SHA256(JSON([repository, package_path]))
identity_key = SHA256(JSON([source_key, resolved_git_sha, package_sha256]))
```

Use normalized source fields returned by inspection when computing a source key.
`source_ref` remains stored metadata; a mutable ref is not a resolved revision.
Repository, ref and Git SHA are caller assertions even when package bytes are
verified. Two skills with the same name can have different sources or revisions;
name alone does not combine their evidence.

A changed resource yields a different package digest and identity. A historical
receipt continues to describe its recorded revision; it is not silently moved
to the current package. No latest-revision alias, supersession or automatic
invalidation erases earlier receipts. Query the exact `identity_key` to inspect
one revision and retain negative history when evaluating a replacement.

## Record verified retained benchmark evidence

Prepare/import evidence using the
[behavioral benchmark guide](https://github.com/i-9-ai/skills/wiki/Behavioral-Benchmark).
Select the actual retained freeze, not a detached comparison JSON or public
summary that cannot replay its original retained artifacts. The selected package
name and `tree_sha256` must match the request's skill and package digest.

The following helper builds a complete request from an explicitly selected
freeze. Save it as `make-quality-request.mjs`. It only reads metadata and writes
one new request file; the quality recorder subsequently performs the full
verification. Its neutral not-run coverage is request scaffolding, replaced by
the server's retained coverage. Always submit this request with `--benchmark`;
do not record the scaffolding alone as an execution report.

```javascript
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const [directory, output, skill] = process.argv.slice(2);
const root = path.resolve(directory);
const manifestBytes = fs.readFileSync(path.join(root, 'manifest.json'));
const manifest = JSON.parse(manifestBytes);
const suite = JSON.parse(fs.readFileSync(path.join(root, 'suite.json')));
const subject = manifest.packages.find((item) => item.name === skill);
const selected = suite.cases.filter((item) => item.skills.includes(skill));
if (!subject || selected.length === 0) throw new Error('Select a frozen package.');
const expected = selected.reduce((sum, item) => sum + item.limits.attempts, 0);
const receipt = {
    schema_version: 2,
    event_type: 'skill.quality.recorded',
    event_id: randomUUID(),
    correlation_id: randomUUID(),
    occurred_at: '2026-09-19T12:00:00.000Z',
    source_host: 'manual',
    source_adapter: 'example',
    session: null,
    payload: {
        collection: 'demo',
        skill,
        source: {
            repository: null,
            source_ref: null,
            resolved_git_sha: null,
            package_path: `packages/${skill}`,
            package_sha256: subject.tree_sha256,
        },
        kind: 'behavioral_evaluation',
        method: {
            name: 'retained-benchmark-comparison',
            version: '1',
            revision: null,
            source_sha256: null,
        },
        result: 'not-run',
        coverage: {
            expected_pairs: expected,
            imported_runs: 0,
            missing_runs: expected * 2,
            paired_cases: 0,
            declared_agent_pairs: 0,
            declared_controlled_agent_pairs: 0,
            fixture_runs: 0,
            manual_runs: 0,
            unexecuted_runs: 0,
            critical_failures: 0,
            treatment_critical_failures: 0,
            comparison_status: 'incomplete',
            selected_cases: selected.map((item) => ({
                case_id: item.id,
                phase: item.phase,
                attempts: item.limits.attempts,
                joint_workflow: item.skills.length > 1,
            })),
            treatment: {
                expected,
                executed: 0,
                blocked: 0,
                not_run: 0,
                missing: expected,
                passed: 0,
                failed: 0,
                unresolved: 0,
            },
        },
        artifacts: [{
            locator: 'manifest.json',
            sha256: createHash('sha256').update(manifestBytes).digest('hex'),
            scope: 'benchmark_manifest',
        }],
        limitations: [],
    },
};
fs.writeFileSync(output, `${JSON.stringify(receipt, null, 4)}\n`, { flag: 'wx' });
```

Run it with caller-owned paths. The helper refuses an existing output file:

```sh
node make-quality-request.mjs \
  /inputs/frozen-benchmark ./benchmark-request.json example-skill

i9-skills skills quality record \
  --db /data/evidence.db --file ./benchmark-request.json \
  --benchmark /inputs/frozen-benchmark
```

The recorder verifies the entire freeze and every imported run/artifact, including
cases unrelated to the selected package. Missing/changed artifacts, changed
package or freeze identity, invalid run receipts and a stale requested digest
block recording before a database is resolved or created. It reads retained
evidence without executing cases, installing tools or copying private outputs
into SQLite.

The server derives method, result, coverage and artifact references from those
verified bytes. A stored retained receipt references the actual manifest and
selected run JSON hashes, which bind the verified artifact inventory and full
asserted run limitations. It retains the suite digest and separately scoped
suite comparison status/result. The selected receipt's result applies only to
cases whose frozen `skills` list includes that package.

Read these fields together:

- `coverage` retains expected/imported/missing arms, treatment execution and
  results, critical failures in both arms, fixture/manual/declared-agent counts,
  comparison completeness, and selected case phases/attempts.
- `benchmark.result_basis` is `critical_treatment_criteria`. A result of `pass`
  can coexist with noncritical failures; `baseline_failed_criteria` and
  `treatment_failed_criteria` retain those counts too.
- `benchmark` retains reported baseline/treatment overruns, comparability reason
  codes and the number of runs declaring limitations. Overruns and unknown or
  differing contexts prevent a controlled comparison; they do not erase runs.
- Mandatory `limitations` retain `fixture_evidence`, `manual_evidence`,
  `comparison_incomplete`, `reported_budget_overrun`, `retained_run_limitations`
  and `joint_workflow` when applicable. Multiple selected skills remain a joint
  workflow, not causal credit for an individual package. `final-acceptance`
  remains a frozen phase label; untouched execution is an operator assertion.

Missing or unexecuted treatment yields honest `not-run` or `blocked` coverage;
a failed critical treatment remains `fail`. A passing critical treatment can
still have an incomplete comparison. Reading a receipt does not rerun the
benchmark or authenticate the executor, grader, metrics or source Git identity.

## Inspect, filter and page

Choose an existing database and explicit collection/period:

```sh
i9-skills skills quality inspect \
  --db /data/evidence.db --collection demo --skill example-skill \
  --from 2026-09-01T00:00:00.000Z --until 2026-10-01T00:00:00.000Z \
  --kind behavioral_evaluation --limit 20
```

The matching MCP query is a complete inert input:

```json
{
    "collection": "demo",
    "skill": "example-skill",
    "from": "2026-09-01T00:00:00.000Z",
    "until": "2026-10-01T00:00:00.000Z",
    "kind": "behavioral_evaluation",
    "limit": 20
}
```

CLI filters `--source-key` and `--identity-key` map to MCP `source_key` and
`identity_key`. `--identity-key` selects one exact revision; `--source-key` selects
its normalized source family across revisions. Both take lowercase SHA-256 values.
Skill, kind and identity filters are optional; collection, `from` and `until` are
required. The window includes `from`, excludes `until` and uses the receipt's
asserted `occurred_at`, not `recorded_at`. No caller-supplied timestamp is
independently authenticated.

Inspection returns `scope`, complete bounded `matching_receipts` and kind counts,
`rows` containing normalized `receipt` plus `recorded_at`, `truncated`,
`next_cursor` and inference limits. Rows sort by `(occurred_at, event_id)`.
When `truncated` is true, pass its exact `next_cursor` as CLI `--after` or MCP
`after`, keeping all period/collection/skill/kind/source/identity filters unchanged.
The display limit may change. A cursor cannot be reused for another scope and
is not a mutation token. Counts describe the full matching window, not just the
remaining page. Inspection never dereferences artifact locators.

For MCP recording, wrap the complete event from this page in
`{"receipt": <event>}`. Optional server-local selections are `package_root` and
`benchmark`; there is no database or assurance field in tool arguments. Select
the database when starting the server:

```sh
i9-skills mcp serve --db /data/evidence.db
```

Use the same normalized event UUID for a retry. The two tools expose closed
schemas through discovery. All selected filesystem paths refer to the server's
machine and require a stable owned input tree. The server rejects database paths
inside the installed collection, its known caller root or selected package and
benchmark roots. A plugin-root process cannot infer an otherwise unknown consumer
workspace; select external state deliberately. See
[Skill MCP](https://github.com/i-9-ai/skills/wiki/Skill-MCP) for transport and recovery.

## Bounds, storage and recovery

| Boundary | Limit and behavior |
| --- | --- |
| Caller receipt | 16 KiB; up to 16 inert artifact references; arbitrary fields and free-form limitations fail. |
| Verified retained receipt | Manifest plus up to 160 selected run references, still within the same 16 KiB total receipt cap. A selection too large for this cap fails before storage; references are never silently dropped. |
| Query | 4 KiB; canonical positive UTC period of at most 366 days; opaque cursor at most 256 characters. |
| Scan work | At most 5,000 matching receipts before cursor or display filtering. |
| Display/output | Default 20, maximum 100 entries; serialized JSON at most 64 KiB. |
| Package inspection | At most 2,048 total filesystem entries, including directories, 4 MiB per file and 32 MiB total; every regular resource participates. |
| Benchmark verification | Existing freeze/run/receipt/artifact limits in the behavioral guide; byte integrity and execution assertions remain separate. |

Only an explicit valid writer creates/upgrades the dedicated evidence database.
Migration 4 adds the quality projection while preserving issued migration 1–3
checksums, old reads, lifecycle/catalog rows and negative history. An existing
schema 1–3 reader returns `schema_upgrade_required` without modifying storage.
An older consumer rejects schema 4; future/altered/untracked schemas and unrelated
SQLite databases fail safely. No command downgrades, resets, copies, prunes or
deletes evidence to recover.

Before an intentional upgrade of valuable history, retain an owner-selected
verified backup. A code rollback does not downgrade the database; use a compatible
consumer or separately authorized backup restoration. `invalid_input` requires
correcting the closed metadata or selected evidence; diagnostics omit raw input
and private paths. `storage_unavailable` requires checking the selected external
file/parent/schema. `evidence_conflict` requires preserving the earlier event and
using a new ID for a genuinely new observation. `query_limit_exceeded` requires
a narrower matching period/scope; lowering the page limit does not lower scan
work. `response_too_large` requires a smaller display or selection. Inspection
never creates a missing directory, database or upgrade.

## Privacy and memory

Store portable metadata only: logical names, source assertions, method identity,
counts, known limitation codes and relative artifact locators/hashes. Keep raw
traces, prompts, private package copies, credentials, participant information and
unsanitized diagnostics in separately controlled evidence, outside SQLite and
public docs. The selected absolute package/benchmark paths are runtime inputs
and are not stored in the receipt. A syntactically accepted public source URL
is not a privacy review; the caller owns what they disclose.

[Skill Memory](https://github.com/i-9-ai/skills/wiki/Skill-Memory) presents
`quality_receipts` separately from lifecycle, catalog and weaker read evidence.
It retains kind/result/assurance and exact revision metadata with explicit
truncation. Its retention inspection counts one `skill.quality.recorded`
occurrence, not an additional occurrence for the mirrored envelope. Neither
receipt inspection nor memory decides promotion, retention/deletion policy,
activation or publication.

The source contracts are
[SkillQualityValidator](https://github.com/i-9-ai/skills/blob/main/src/validator/SkillQualityValidator.ts),
[SkillQualityService](https://github.com/i-9-ai/skills/blob/main/src/service/SkillQualityService.ts)
and [SkillQualityRepository](https://github.com/i-9-ai/skills/blob/main/src/repository/SkillQualityRepository.ts).
See [Validation](https://github.com/i-9-ai/skills/wiki/Validation) for separately
executed structural conformance and
[Lifecycle Evidence](https://github.com/i-9-ai/skills/wiki/Lifecycle-Evidence)
for existing event meanings and denominators.

## Explicit official process observation

Ordinary `repo validate-official` continues checking every canonical package and
the temporary scaffold without recording a quality receipt. In a prepared CI
environment, the operator can select one canonical skill and explicitly request
an observation using all three flags together:

```sh
node bin/index.mjs repo validate-official \
  --project ./collection \
  --quality-request /tmp/owned-quality/request.json \
  --quality-db /tmp/owned-quality/evidence.db \
  --quality-output /tmp/owned-quality/new-observation
```

The parent directories must already exist at canonical absolute paths. The
output directory must be new. Keep the selected request, database and output
outside the installed package, caller repository and selected skill. Request,
DB and sidecar collisions are rejected before setup; valid siblings are allowed.
Those reserved destination names also reject normalized case-only variants,
conservatively including on a case-sensitive filesystem.
Do not select a consumer database for the disposable CI demonstration.

The closed request contains only `collection`, `skill`, and `source`. Its
`source.package_path` is `.agents/skills/<skill>`, and its `package_sha256` must
match every regular file in that package. Source repository/ref/Git revision
remain assertions even when the CI configuration supplies the checked-out head.

The observer derives tool version, immutable source revision and archive digest
from the repository's reviewed configuration, checks the actual version response,
and fingerprints the selected package immediately before and after its real
validation call. It retains `official-quality.json` before opening the database.
Only unchanged bytes after completed setup and a matched version can receive
`locally_observed_official_process`. Conformance failure remains a failed receipt;
timeout, interruption, unavailable process or execution error remains blocked.
Setup/version failure or changed/unavailable post-validation bytes retain a
blocked artifact without an observed receipt. A late database failure preserves
the retained artifact and returns failure; no automatic reset or evidence deletion
occurs. CLI failure still reflects other canonical/scaffold failures independently
of the selected receipt.

The artifact and observation JSON written to the CI log contain compact method,
fingerprint, status and result metadata, not stdout/stderr, source text or raw
error messages. Ordinary validator diagnostics remain separate. Inspection treats
relative artifact locators as inert. Copying that JSON into public record ingress
cannot recreate an observed assurance tier. Correct-version official conformance
does not prove behavior, rights, safety, native installation or publication readiness.

The repository validation workflow demonstrates this path for `skill-authoring`
using runner-owned disposable request/DB/output, then performs the same read-only
quality query exposed to CLI/MCP consumers when a receipt database exists. A
successful observation without its database fails the workflow. Setup/version
failure does not create a database merely to query it. A passing workflow is evidence only
for its exact head. Local tests use fake process seams and synthetic workspaces;
they neither install Python nor provide actual official-process evidence.
