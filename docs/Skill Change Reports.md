# Skill change reports and onboarding

Compare two pinned observations of the same skill or collection before choosing
a version bump. Reports separate changed bytes, reviewed contracts, source
assertions and validation receipts. They recommend `patch`, `minor` or `major`
only with sufficient evidence; otherwise they return `undetermined` and explain
what is missing or contradictory. Reporting never edits a version or release.

## Installed guide

With Node.js 24+ and an existing prepared installation:

```sh
node bin/index.mjs skills onboarding
node bin/index.mjs skills onboarding --section snapshot
node bin/index.mjs skills onboarding --section bump
```

These return JSON with `guide_version` and the installed `package_version`.
The MCP tool `skill_onboarding` accepts `{}` or `{"section":"bump"}` and returns
the same data. Reading it executes nothing, selects no database and installs
nothing.

The full guide bundles complete disposable `fixture.files` and seven sections:
inspect, snapshot, audit, plan, evolve, verify and bump. Commands are argument
arrays with explicit effects and, when needed, `stdout_file` destinations.
Replace `<installed-root>` with the installed package and `<workspace>` with a
new disposable caller directory. Review before execution. The fixture's stale
catalog exercises an actual catalog repair; its synthetic evidence is not proof
of validation on real work.

The sequence uses [collection maintenance](Collection%20Maintenance.md) and the
bundled snapshot helper. Evolution without `--apply` is a preview; the explicit
write supports catalog synchronization only. The `prepared_ci_only` official
validation command needs a prepared environment and is separate from the offline
walkthrough. Behavioral, compatibility and native-host evaluation require their
own evidence; the guide does not mark them passed automatically.

## Export observations

Select an existing verified schema-2 snapshot from the bundled `skills-snapshot`
helper. The guide supplies complete capture and verification commands. Keep
snapshots outside collections and discovery roots. `skills observe` reads stored
content; it never captures or restores a snapshot.

Save this collection selection as `subject.json`:

```json
{
  "subject": {"scope":"collection","collection":"example","skill":null},
  "source": {"repository":null,"source_ref":null,"resolved_git_sha":null}
}
```

For a skill, use `"scope":"skill"` and its slug in `skill`. A public HTTPS
repository, requested ref and resolved Git SHA may replace source nulls. A ref
requires a resolved SHA; a SHA requires a repository. These are caller assertions,
never inferred from a folder digest or verified remotely.

```sh
node bin/index.mjs skills observe --snapshot ./snapshots/before --subject ./subject.json > before.json
node bin/index.mjs skills observe --snapshot ./snapshots/after --subject ./subject.json > after.json
```

Each result is `{sha256, observation}`. It records the subject, source, complete
sorted relative-path inventory, reviewed contracts and validation. Files retain
types, ordinary permissions, lengths and hashes. Links retain a link-text hash
and whether they are absolute; targets are not followed or returned. Root
permissions remain observable, including when rebasing a package snapshot.

`content_identity` uses `sha256-observation-v1` over the subject and normalized
inventory. The original snapshot tree digest remains separate. Neither is a Git
SHA or lifecycle package digest. The outer SHA pins the normalized document and
its claims; it does not authenticate them. Schema-1 snapshots require an explicit
new capture, not conversion by this adapter.

## Add reviewed evidence

After inspection and actual checks, export again with `--evidence evidence.json`.
That file contains `contracts` and `validation`:

- `contracts.coverage` is `complete`, `partial` or `not_provided`. Entries have
  `id`, `kind` (`capability`, `input`, `output`, `compatibility` or `integration`),
  `required`, `signature_sha256`, and defining `files` as exact inventory
  `path`/`sha256` pairs. A changed signature hash does not prove compatibility.
- Validation entries have `kind` (`structural`, `official`, `behavioral`,
  `compatibility` or `security`), `status` (`passed`, `failed` or `not_run`),
  `content_sha256` matching the content identity, and `evidence_sha256` for a
  performed check (`null` for `not_run`). Preserve failures.

Evidence changes the document digest. Validation binds to content identity,
avoiding a circular digest. Complete synthetic examples for all four
recommendations are bundled in the `bump` section and can be submitted unchanged
to try the interface. Replace synthetic claims with actual receipts for real
work. The reporter checks structure and consistency, not the truth of checks,
and never reruns them.

## Compare

Create `comparison.json` with `schema_version: 1`, the complete `before` and
`after` outputs, and `assessment: null`. Logical subjects must match exactly.

```sh
node bin/index.mjs skills report bump --file ./comparison.json --limit 20
node bin/index.mjs skills report bump --file ./comparison.json --limit 20 --offset 20
```

`--file -` reads stdin. `skill_bump_report` accepts the same request with optional
`limit` and `offset` through MCP. It accepts data, never arbitrary snapshot or
file paths. An absent assessment correctly returns `undetermined`.

A completed assessment pins `before_sha256` and `after_sha256`, declares
`coverage`, and reviews every changed file and contract plus changed source
assertions. File reviews contain `path`, `reason`, related `contracts` IDs and
`evidence_sha256`; contract reviews contain `id`, `reason` and `evidence_sha256`.
`provenance` is `null` or a review with `reason` and `evidence_sha256`. Reports
retain the assessment digest and each displayed change's evidence. Pagination
affects display only; classification uses the complete bounded comparison.

| Reviewed effect | Recommendation with sufficient evidence |
| --- | --- |
| Unchanged contracts with `documentation_only` or `compatible_correction` | `patch` |
| `compatible_addition` or `optional_integration` | `minor` |
| `contract_removed`, `incompatible_contract`, `required_input_added` or `required_migration` | `major` |
| Missing, partial, contradictory, unknown or identical evidence | `undetermined` |

The highest supported effect wins. Each changed contract needs a reviewed
changed defining file whose impact does not understate the contract review.
A newly required integration cannot be an optional addition. Provenance review
accepts `compatible_correction`, `required_migration` or `undetermined` only.

Candidate structural and official checks must pass. Changed contracts or reasons
other than `documentation_only` also require reported behavioral and compatibility
passes. Security remains separately visible, not publication approval. A failed
baseline may support a reviewed repair; preserve its failure.
`required_candidate_validation`, `rationale` and `insufficiencies` explain the
result. Invalid or stale references fail instead of yielding a partial report.

## Limits and recovery

Requests are capped at 768 KiB; each observation at 352 KiB, 1,024 inventory
entries and 128 contracts. Pages default to 20 changes, allow 1–100, and use
offsets 0–4096. Reports are capped at 480 KiB before the MCP envelope; guides at
64 KiB. Oversize input/output fails. Reduce selected scope or page size instead
of truncating evidence used for classification.

Snapshot verification accepts manifests up to 352 KiB, 1,024 combined
content/preimage entries and 64 MiB of object reads, including repeated references
and preimages. Its subprocess has a ten-second deadline. Subject input is capped
at 8 KiB; optional evidence at 128 KiB. Both cannot select stdin. Unsafe, altered,
unsupported or incomplete snapshots fail. Keep the workspace stable; these checks
do not promise race-proof filesystem confinement.

Errors expose categories, not paths or submitted documents. Reports and guides
never write versions, evidence storage, source packages or release metadata.
[Release preparation](Release%20Management.md), installation and publication keep
their own authorization boundaries.
