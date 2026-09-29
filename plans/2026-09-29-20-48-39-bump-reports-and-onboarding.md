# Evidence-based bump reports and portable onboarding

Issue: [#22](https://github.com/i-9-ai/skills/issues/22), completing the bump-report
and onboarding acceptance in [#17](https://github.com/i-9-ai/skills/issues/17).

## Objective and authority

Compare two explicitly selected, immutable observations of the same logical skill
or collection and return a reviewable file/contract/provenance/validation report.
Recommend patch, minor or major only when explicit contract review and validation
evidence are sufficient. Otherwise return undetermined with concrete missing or
contradictory evidence. Hash changes establish changed bytes, never semantic
compatibility.

Bundle a versioned operational guide that works in a relocated installed artifact
without a website, source checkout, global installation or state directory.
Expose identical report and onboarding data through the existing CLI and MCP.

The user authorized implementation of the remaining issues. The coordinating
agent accepted this design before implementation, including the observation
producer, and released the shared CLI/MCP adapters after issue-26 integration.
There is no native planning mode in this session. The coordinator owns this plan's
index entry, public documentation, package acceptance and integration; issue-26
repositories, services and validators remain outside this implementation's scope.

No report or guide operation edits versions, prepares a release, changes a skill,
installs, fetches sources, starts a background process or writes an evidence
database. No new dependency, provider integration or schema migration is needed.

## Existing evidence and reuse

- Catalog observations retain package and metadata digests but no per-file
  inventory. They cannot establish a file diff and must not be silently promoted
  into sufficient bump evidence.
- The bundled `skills-snapshot` helper already verifies complete immutable file
  inventories and content-addressed objects. Its manifest tree hash is a
  snapshot-specific identity, separate from Git commits and lifecycle package
  digests. Reuse this verified inventory for observation production.
- Reuse bounded strict JSON decoding, safe-root and relative-path validation,
  public-source URL policy, and installed-root resolution. Reuse the existing
  `catalog inspect/check`, `collection audit/plan/evolve` and package snapshot
  commands in onboarding; do not duplicate their implementation.
- The current evolution command writes only a regenerated catalog after an
  explicit `--apply`, with a verified external preimage. Semantic repair remains
  a specialist handoff. The guide must state this limit precisely.
- Keep release preparation and publication in their existing separate workflows.
  This report is advisory evidence, not an instruction to execute them.

## Public interfaces

1. `skills observe --snapshot PATH --subject FILE [--evidence FILE]` verifies a
   selected existing snapshot and prints one closed observation document. It
   neither creates nor restores a snapshot. `subject` identifies the logical
   collection/skill and optional asserted public Git provenance; `evidence`
   supplies optional reviewed contracts and exact-content validation receipts.
   Missing review evidence produces an observation with explicit missing coverage.
2. `skills report bump --file FILE [--limit N] [--offset N]` reads one bounded JSON
   request containing both digest-pinned observations and an optional comparison
   assessment. `-` supports stdin. The report is JSON on stdout.
3. `skills onboarding [--section SECTION]` returns the versioned installed guide,
   with `all`, `inspect`, `snapshot`, `audit`, `plan`, `evolve`, `verify` and `bump`
   sections. It does not run the demonstrated commands.
4. MCP tools `skill_bump_report` and `skill_onboarding` accept the same structured
   report request/query as their CLI services. MCP accepts observation data, never
   arbitrary snapshot/file paths. Observation production is a caller-owned local
   capability; submitted observations remain assertions and are labeled as such.

New classes live in the existing singular layers: a snapshot-observation
repository, bump/onboarding validators and services, immutable guide configuration,
and matching Command classes. The existing MCP service/transport and the single
CommandConfiguration registry receive small adapters only after coordinator
authorization. No second MCP server, storage model or launcher is introduced.

## Immutable observation contract

Use a closed `schema_version: 1` document with:

- `subject`: `scope` (`skill` or `collection`), a bounded collection slug and a
  skill slug only for skill scope. Before/after subjects must match exactly.
- `source`: nullable normalized public HTTPS repository, requested ref and
  resolved 40/64-hex Git SHA. A requested ref requires a resolved SHA; a Git SHA
  requires a repository. These are supplied assertions, not derived from a folder
  digest or certified by the observer.
- `inventory`: a complete sorted selection of portable relative paths, types,
  ordinary permission bits, file byte lengths and byte SHA-256 values. Directory
  entries and link-text digests remain observable; raw link targets and absolute
  source/snapshot/receipt paths are omitted. No bodies, prompts or credentials are
  returned. External link targets are never followed or compared implicitly.
- `content_identity`: a named SHA-256 algorithm over the canonical subject and
  normalized inventory including root permissions. Retain the verified original
  snapshot tree digest separately. For package snapshots, strip only the verified
  selected package prefix and exclude its ancestor directories; retain the
  package root's own mode. Do not compare whole-snapshot and rebased hashes.
- `contracts`: `complete`, `partial` or `not_provided` coverage plus reviewed
  entries with stable ID, kind (`capability`, `input`, `output`, `compatibility` or
  `integration`), required/optional status, signature digest and one or more
  defining file paths with their exact observed byte hashes. Every reference must
  resolve within this observation. This is reviewed evidence, not NLP inference
  or a new mandatory file inside every skill. Contract differences include kind,
  required status, signature and defining-file paths. Updating a defining file's
  bound byte hash alone does not establish a semantic contract difference.
- `validation`: bounded receipts for structural, official, behavioral,
  compatibility and security checks. Each records the exact content identity,
  status (`passed`, `failed` or `not_run`) and an evidence digest for a performed
  check. Retain baseline failures honestly; do not invent passing validation.

Compute a canonical observation-document SHA-256 after normalization. The report
request supplies the expected digest separately for each observation. Recompute
and reject mismatches; file/field ordering does not alter canonical identity.
Validation binds to content identity, avoiding a circular dependency on the
document digest. The document digest pins the complete evidence, including its
claims, and does not authenticate the author of those claims.

The observer reads only schema-2 snapshot manifests and their selected stored
objects through the existing verifier. Schema-1 snapshots remain supported by
their owning helper but require an explicit new capture for this observation
interface; this adapter does not convert or modify them. Reject incomplete,
linked/hard-linked, altered, unsupported or oversized inputs without outputting a
partial observation. Preflight total declared object bytes, entry count and
manifest size before a bounded verification subprocess. Recheck manifest identity
after verification and fail on detected change. This is stable-workspace
verification, not a claim of race-proof confinement.

## Comparison evidence and recommendation

The request contains `before: {sha256, observation}` and
`after: {sha256, observation}`, plus an optional closed assessment pinned to both
document digests. Assessment coverage must account for every changed inventory
entry, every added/removed/changed contract and any provenance change. Unknown,
duplicate, stale or mismatched references are invalid input, not evidence.

Use bounded normalized review reasons, referenced contract IDs and evidence
digests rather than arbitrary executable instructions or unbounded narrative.
Supported reasons distinguish documentation-only changes, compatible correction,
compatible addition, optional integration, removed contract, incompatible contract,
new required input and required migration. Preserve an explicit unknown reason.

The deterministic policy is:

- Missing/partial contract inventories, uncovered changes, unknown review impact,
  missing or failed required candidate checks, conflicting evidence, or identical
  observations return `undetermined`, with static reason codes.
- Sufficient complete review of unchanged contracts plus documentation-only or
  compatible corrections yields `patch`.
- Sufficient evidence of compatible added capabilities or optional inputs,
  outputs or integrations yields `minor`.
- A reviewed removed/incompatible contract, newly required input or required
  migration yields `major` when the remaining evidence is sufficient. Newly
  required integrations cannot be reviewed as optional additions. Removal, new
  required input and optional-integration file claims must reference matching
  contract changes; contradictory claims remain undetermined.
  Each changed contract must link to a reviewed changed defining file, and that
  file's reviewed impact cannot understate its linked contract review.
- The highest supported impact determines the recommendation. An absent
  assessment never defaults to patch. Changed signature hashes alone never prove
  compatible or incompatible behavior.

Candidate structural and official checks must pass for a recommendation. Any
declared contract difference or review reason other than `documentation_only`
also requires reported behavioral and compatibility passes for the candidate.
The tool uses explicit review assertions instead of file-extension heuristics
for instructional and executable effects. A known-failing baseline
may support a reviewed repair; preserve its failures. Security and provenance
evidence remain separately visible and do not imply publication readiness.

Return the policy version, selected identities, recommendation, static rationale
and insufficiency codes, exact diff counts, bounded changed-file/contract pages,
source differences, validation status and explicit evidence-origin limits. Include
before/after hashes and the submitted review/evidence digest for each displayed
changed entry. Return the canonical assessment digest and its provenance review
independently of the page. Never silently truncate evidence used
for classification: compute the complete bounded comparison before paging its
display. A report does not rerun submitted validation or verify remote Git state.

## Bounds and privacy

Keep the whole report request under 768 KiB so its MCP envelope fits the existing
1 MiB ingress bound. Each observation is capped at 352 KiB and supports at most
1,024 inventory entries, 128 contracts and a bounded validation set; complete oversized selections fail
and should be split into explicitly selected skill observations. Portable paths
are at most 1,024 characters, identifiers 64 and hashes lowercase canonical hex.
Snapshot observation verification accepts a manifest of at most 352 KiB, 1,024
combined content/preimage entries and at most 64 MiB of selected object reads,
with a ten-second subprocess deadline. Count preimages and repeated references
in the verification budget even though they do not become implicitly compared
content. Subject/source input is capped at 8 KiB; optional review/receipt input is
capped at 128 KiB. Both cannot select stdin simultaneously.

Use at most 100 displayed changes per page, default 20, and deterministic offset
pagination bound to the two immutable observations. Contract/evidence arrays also
have explicit count and byte caps. Keep guide output below 64 KiB and ordinary
report output below 480 KiB before the MCP text/structured envelope; retain the transport's bounded
error and smaller-page recovery. Errors never echo source bodies, private paths,
malformed JSON or submitted review text. No database is selected or created.

## Versioned onboarding and runnable examples

Store one source-owned structured guide with its own version and the installed
package version. Resolve bundled helpers/examples relative to the installed
artifact, never the caller's cwd or home. Command templates use explicit caller
selections and an installed-root placeholder; never disclose a host absolute path
through MCP. Bundle complete synthetic observation/assessment examples for patch,
minor, major and undetermined reports, plus a minimal collection fixture for the
operational walkthrough. Guide and example configuration is source-owned
TypeScript data compiled into the existing `dist/**/*.js` package allowlist; no
additional manifest resource or dependency is required.

The seven stages show existing command names, expected outputs, authority and
limits: catalog inspection and source observation; explicit package/collection
snapshot capture and verification; bounded structural audit with unsupported
semantic checks identified; plan creation and preview; explicit catalog-only
evolution with retained recovery; structural verification and separately prepared
official validation; digest-pinned bump reporting before separately authorized
version/release work. Explain unavailable behavioral/native evidence rather than
labeling it passed. No example installs, releases, uploads or silently mutates a
real collection. Installation, discovery, routing and onboarding never trigger the
evolution sequence.

## Implementation, validation and removal

1. Implement closed observation/request validation, canonical identities and a
   pure deterministic comparison/recommendation service with focused tests.
2. Add read-only verified-snapshot observation production and its bounded failure
   tests; do not edit the snapshot package unless an evidenced adapter gap demands
   an explicit plan amendment.
3. Add the versioned guide and complete synthetic examples, then CLI/MCP adapters.
4. Update public documentation, relevant durable indexes and a concrete Changeset
   through coordinator-owned integration. Keep the frozen issue-26 schema intact.
5. Run focused Node 24 tests, then coordinator-owned full checks and packed runtime
   acceptance, Changesets status, diff checks and independent exact-commit review.

Acceptance tests cover verified file additions/modifications/removals/mode and
type changes; immutable/digest/subject mismatch; source assertions; incomplete and
incompatible contracts; every recommendation and missing validation; unchanged
observations; dishonest hash-only compatibility claims; stale/contradictory
assessment references; bounded inputs, pages and redacted errors; rejected unsafe
snapshot paths/objects and timeout; byte-identical read-only source/store state;
CLI/MCP result equality; guide stages with real command registration; and a clean
relocated artifact exercising the complete synthetic walkthrough without a global
home, source checkout, network, install, Python or native provider.

Removing these new interfaces and bundled guide/example resources leaves all
skills, snapshots, evidence databases and release metadata untouched. No migration,
rollback write, pruning or artifact deletion is part of removing this feature.
