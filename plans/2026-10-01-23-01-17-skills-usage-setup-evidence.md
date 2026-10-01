# Skills usage setup: design and local evidence

## Objective and prior implementation contract

Deliver one portable meta-skill for the explicitly selected skill-read
registration lifecycle: preview, enable, inspect and remove an owned registration
while retaining unrelated configuration and local observations. Implementation
follows the prior [optional telemetry plan](2026-10-01-21-50-00-optional-telemetry-and-public-submission.md).
The output is one managed registration and its ownership receipt. A local
metadata-only sink demonstrates the registration's intended observation boundary.

The owner authorized this package, its reference implementation, synthetic
verification and catalog handoff. No real home settings, installed collection,
native host, network upload, publication or provider permission was changed by
the package tests. Repository catalog/index maintenance and independent review
of the final commit belong to the integrating maintainer.

## Design and naming

`skills-usage-setup` groups the collection subject first and names the setup
responsibility. Inspection and receipt-matched removal are states of that same
registration. The inspected repository catalog and actual sibling entrypoints
expose no existing package with this outcome. Host compatibility checks describe
discovery structure, installation installs skill packages, and evidence
collection inspects evidence; none owns observer registration. Keep these
responsibilities separate. This is a bounded collision check, not a claim of
global name uniqueness. The global catalog helper was unavailable; its freshness
was not verified and it was not rewritten.

The chosen package uses a complete generic Node 24 helper with an injected
configuration-provider interface. Its default provider merges exact supplied
objects into selected JSON event arrays; it does not invent a host schema or
execute commands. Optional native adapters and the separately maintained toolkit
CLI are conditional references. The ordinary entrypoint includes a complete
synthetic reader and local metadata producer. A manual JSON/receipt route remains
available without Node or trusted hooks, with automatic capture unavailable.

Fourteen package files contain the entrypoint, Apache-2.0 license, attribution,
one helper, its tests, three conditional references, interface metadata, SVG/PNG
icons and icon source/render receipts. No collection contract or catalog is a
runtime dependency. The helper copies no repository telemetry implementation.
No provider is required in the core; no preparation runs on discovery or install.

## Discovery and domain research

Research was performed on 2026-10-01 using task-specific skills.sh searches for
skill telemetry, skill usage, hooks, usage tracking and analytics, followed by
primary repository inspection. Queries included `site:skills.sh "skill"
"telemetry"`, `site:skills.sh "skill usage" hooks`, `site:skills.sh "usage
tracking"` and `site:skills.sh "hooks" "analytics"`; the final refinement
selected Hook Development. Bounded discovery found no accepted skill that
provides this registration/receipt lifecycle. Directory installation popularity
does not measure entrypoint reads or task effectiveness.

The complete 11-file
[Hook Development package](https://github.com/anthropics/claude-code/tree/52c76441cae91f6891e4712306bffb057ff6fec5/plugins/plugin-dev/skills/hook-development)
was reviewed at `52c76441cae91f6891e4712306bffb057ff6fec5`: its entrypoint,
three shell examples, three references and four script/documentation files.
Its recorded package digest is
`f362587b4f5161b6c990c1e4c28a9796606d8fa6bde97ad5c6a4d0cae733548c`.
The root LICENSE.md reserves rights and points to commercial terms; no scoped
permissive override was found. License byte hash:
`728158fd1037143fad6907e8fa34804177e598b7326519503fe83cafdef849e6`.
It was rejected as an implementation base because rights do not support copying,
its provider-specific raw logging and stale payload examples conflict with the
owner's metadata boundary, and it has no registration ownership receipt.
No candidate prose, script, template or artwork was copied. With no accepted
contributing skill packages, synthesis was explicitly skipped.

Current authoritative research opened
[Codex hooks](https://learn.chatgpt.com/docs/hooks),
[Claude hooks](https://code.claude.com/docs/en/hooks),
[Gemini hooks](https://geminicli.com/docs/hooks/reference/),
[Copilot CLI hooks](https://docs.github.com/en/copilot/reference/hooks-reference),
[Copilot SDK hooks](https://docs.github.com/en/copilot/how-tos/copilot-sdk/hooks/post-tool-use),
[Node 24 filesystem APIs](https://nodejs.org/docs/latest-v24.x/api/fs.html)
and [skills.sh's telemetry explanation](https://skills.sh/docs/faq).
These live pages have an observation date rather than an immutable documentation
revision. They are reference-only. Current host result envelopes override stale
candidate fields. Codex after-events may include unsuccessful Bash operations;
Gemini after-events also require result-status inspection; Copilot CLI/SDK
schemas differ. An after-event alone is not a confirmed skill read.

Process-owner requirements reconcile those facts with explicit selected files,
metadata-only local records, preserved evidence, portable fallback, no automatic
runtime installation and no claim that reads prove activation or effectiveness.
The owner's Codex implementation reference at
`ff6aec96948b70d94983af2641a6b67c94faeff5` is source context, not an executed
native session. Native launch/trust/delivery remains untested here.

## Script and security findings

The helper uses Node built-ins only. Setup defaults to preview and status cannot
write. It merges only supplied event entries, rejects matching unowned entries,
and removes only a single exact receipt-owned match. Changed, duplicated or
missing entries refuse removal. An inactive receipt and evidence are retained.
Settings, receipts, cooperating locks and evidence must have distinct paths.
Runtime or collection disappearance does not prevent owned removal.

Input/configuration bounds, normalized explicit paths, ancestor inspection,
nonblocking no-follow opens, pre-open regular-file checks, single-link descriptors, before/after checks and
exclusive cooperating locks cover the tested filesystem surfaces. Unsupported
no-follow opens fail explicitly. Settings/receipt writes attempt rollback if the
receipt changes, preserving the other writer. Observation appends are bounded;
unknown payload fields are rejected. Diagnostics are fixed and do not echo
matched data. Setup failures return 1; observation failures return 0 without a
success receipt so optional capture remains nonblocking. Consumers must inspect
`recorded` rather than equating exit zero with coverage.

These controls assume a stable caller-owned directory. They do not promise
malicious-race confinement, a crash-proof two-file transaction, authentication
of producer claims, historical JSONL sanitization, deduplication or aggregation.
The direct sink does not discover collection roots or inspect native results.
No command execution, network, dependency installation, environment credential
lookup, home scan or remote evidence sink is present in the helper.
Independent staging review found two P2 issues: opening a FIFO could block before
its descriptor was inspected, and a JSONL final record without LF could merge
with the next record. Both were fixed. Timed FIFO status/store fixtures confirm
rejection without waiting; EOF fixtures confirm the old valid record is retained,
the next record is separated, and the separator counts toward the storage bound.
Own static review found no remaining blocker for this bounded local reference;
independent review of the exact repository commit is still required.

## Icon evidence

The adapted Material toggle geometry represents deliberate enablement; the
ledger strokes and status dot represent retained observations and a receipt.
The source is Google's Apache-2.0
`src/toggle/toggle_on/materialicons/24px.svg` at
`40a7a292a79d9394157e1ea24f83d52d5e17c556`, SHA-256
`5b2cea3a0c4439affcdcfe34e6ed89722c09c174d0a4e5af790e73a38fa388bf`.
The complete license, attribution and modification notice are bundled. The
candidate's SVG contains only static geometry. Its 100×100 PNG was rendered with
rsvg-convert 2.63.2 and visually inspected for a clear toggle and ledger. Sibling
icon comparison found no matching toggle glyph. Source and artifact hashes are
in the package's icon receipts; no provider-affiliation claim is made.

## Frozen acceptance rubric and actual observations

The six acceptance cases were fixed before the final rerun. Authoring regression
fixtures were reused; these are not held-out model benchmark results.

| Case                       | Observable criterion                                                                                                            | Actual evidence                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| C1 ordinary setup          | Complete inline route produces preview, enabled status, one synthetic confirmed read, exact removal and retained unrelated data | Both entrypoint shell blocks executed successfully; one original hook and one observation remained |
| C2 near miss               | A request to rank effectiveness does not enter registration setup                                                               | Manual route inspection finds an explicit non-trigger; no model comparison executed                |
| C3 ownership drift         | Changed, duplicate, missing or unowned entries are preserved/refused                                                            | Isolated tests passed for all four branches                                                        |
| C4 missing host capability | Unsupported or untrusted capture uses explicit metadata/manual fallback and states coverage gap                                 | Manual route inspection passed; native execution not run                                           |
| C5 missing runtime/root    | Status reports missing runtime and removal remains available                                                                    | Isolated test removes runtime directory and collection before owned removal                        |
| C6 hostile input/state     | Payload fields, prototype path, links, bounds, occupied locks and receipt conflict do not erase unrelated data or leak input    | Isolated tests passed; final package credential scan clean with output suppressed                  |

The no-skill comparator and fresh model executions were not run. No improvement,
provider compatibility, effectiveness, production or universal-safety claim is
made. Local acceptance is scoped to manual instruction tracing and the actual
scripted cases on Node 24.21.0/POSIX; Windows remains unverified. Root review and
live exact-head CI are separate readiness gates.

## Executed validation and candidate identity

- `node --test <candidate>/tests/usage-setup.test.mjs`: 13 tests passed, no failures,
  skips or cancellations, including copied-package execution from another cwd.
- The complete entrypoint example passed after the final helper changes;
  metadata was emitted only after a successful synthetic entrypoint read.
- Official `skills-ref validate <candidate>` passed using version 0.1.0 from the
  pinned Agent Skills source `69ef37e9424c0a7ea9dd2293b559e43ec8176379`; installed
  distribution source archive SHA-256 matches the repository's declared
  `0c9eabbe602095c4f4d771ee55bf74f6bc7e1c770f25d4fe29ce9802981daa20`.
- The bundled authoring `validate-skill` passed: matching name, full license,
  three local links, explicit setup sections and OpenAI interface/icon resources.
- Gitleaks 8.30.1 scanned all package files successfully. Child output was captured
  and suppressed, with 100% redaction requested. This local version check is
  separate from the checksum-pinned Linux CI scanner.
- Targeted Prettier formatting passed. Repository-wide checks, catalog sync and
  exact-commit independent review are performed by the integrating maintainer.

Final package inventory: 14 files. SHA-256 over ASCII-sorted relative path,
NUL, file SHA-256, newline records:
`ea5d209100dea4805913945ba6153fe435288966b4bbca038ae215f2f4fd9592`.
The preserved run inventory binds these observations to exact package bytes.
No secrets or private source snapshots are included in distributed evidence.

## Handoff, rollback and remaining limits

The package was copied to canonical `.agents/skills/skills-usage-setup`; its
inventory matches the frozen candidate and the official validator passed on that
path. The maintainer then
regenerates the collection catalog/indexes, runs full repository and packaging
checks, and obtains independent review on the final commit. Optional toolkit
commands require verifying their actual installed/published version; source
availability alone does not prove npm availability.

Rollback removes this new source package and release intent, then regenerates
the catalog; no installed consumer or user evidence is removed. A consumer removes
only exact receipt-owned registrations using preview and explicit write intent.
Drift and crash recovery retain the caller's preimage and evidence for deliberate
reconciliation. No host, telemetry store or history rewrite is implicit.
