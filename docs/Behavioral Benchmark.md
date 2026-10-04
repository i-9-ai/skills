# Skill behavioral benchmark

The behavioral benchmark freezes a synthetic task suite and the exact selected
skill packages, retains externally produced run artifacts, and compares a
no-skill baseline with a treatment under declared comparable conditions. Its
three CLI commands prepare evidence and inspect it. They do not execute a case,
call a model, grade an artifact, or certify a skill as ready.

This is a candidate interface. The published npm package `@i-9.ai/skills@0.3.4`
does not contain these commands. Use a reviewed candidate checkout with Node.js
24+ and its locked dependencies already present, or a separately prepared
installed CLI containing the same candidate. The examples below run from that
candidate checkout. They are not instructions to install the latest npm release.

## Prepare the closed freeze

The demonstration suite is
[`benchmarks/behavioral/suite.json`](https://github.com/i-9-ai/skills/blob/main/benchmarks/behavioral/suite.json).
Its ID is `skill-lifecycle-synthetic-v1`. It contains four synthetic acceptance
cases with separate executor prompts and evaluator rubrics:

| Case | Requested outcome | Selected treatment packages |
| --- | --- | --- |
| `create-review-intake` | Create a focused review-intake skill through the authoring pipeline. | `skill-authoring`, `skills-discovery`, `skill-domain-research`, `skill-design`, `skill-security-review`, `skill-evaluator` |
| `plan-overlap-refactor` | Produce a reviewable plan for overlapping skill responsibilities. | `skills-refactoring`, `skill-naming` |
| `migrate-additively` | Perform only the authorized additive migration. | `skill-migration` |
| `refuse-collision` | Preserve a conflicting destination and refuse an unauthorized replacement. | `skill-migration` |

The corpus is inert input, not a result set. Its source fixtures include their
license. Each case's prompt describes the allowed task; the evaluator rubric and
criteria stay outside the executor handoff.

`benchmarks/behavioral/` holds the experiment inputs and retained public pilot
evidence in the source checkout. They stay outside `docs/`, the Wiki mirror,
the website's copied assets and the npm package allowlist. This guide and its
concise results remain public documentation; repository links expose the
separately retained evidence. A prepared installed candidate needs an explicitly
selected suite source because the corpus is not bundled with the CLI.

The nested fixture `SKILL.md` files are synthetic task inputs, not collection
packages. Collection installation and plugin discovery select `.agents/skills`;
do not select the fixture subtree as a skill-installation source.

```sh
node bin/index.mjs benchmark prepare \
  --suite benchmarks/behavioral/suite.json \
  --skills-root .agents/skills \
  --output ../skill-lifecycle-synthetic-v1
```

`--suite` and `--output` are required. `--skills-root` explicitly selects the
package collection; the command also supports the existing `--project` selection
when resolving the caller's project collection. The output must be a new
directory with an existing parent, outside the source suite and skill trees.
Preparation refuses an existing output instead of merging or overwriting it.

The suite is a closed, versioned schema: unknown fields and invalid identities,
limits, paths or criteria are rejected. Preparation copies only the declared
regular confined inputs and selected package files, with a complete file
inventory. Symlinks, hardlinks and special files are rejected. The workspace
owner must keep the selected sources stable during the operation; these checks
do not constitute a race-proof sandbox.

The prepared directory contains normalized `suite.json`, the freeze manifest,
selected `packages/<name>` trees, and each case's executor handoff:

```text
cases/<case-id>/prompt.md
cases/<case-id>/fixtures/<declared-target>
cases/<case-id>/executor.json
packages/<package-name>/...
runs/<run-id>/...                 # added only by explicit import
```

`executor.json` contains the case prompt, fixture selection, no-skill baseline
package selection, treatment package selection and limits. It omits evaluator
criteria and rubrics. Give the baseline only its allowed fixtures and prompt;
give the treatment the same inputs plus the frozen selected packages. Keep the
grading material out of both execution contexts.

The freeze manifest binds `suite_sha256`, the complete `{path, sha256, bytes}`
inventory, each package's `tree_sha256`, and `benchmark_sha256`. A package tree
digest incorporates the ordered relative paths and file hashes, so equal names
alone do not establish equal package bytes. Subsequent commands verify the
freeze before accepting evidence or reporting a comparison. Editing the suite,
copied fixtures, prompts or packages invalidates that benchmark identity; prepare
a new freeze for a changed experiment.

## Execute and grade outside the CLI

Run baseline and treatment in separate fresh disposable contexts. Record the
executor, model, environment, settings, execution status and limitations for
each run. Use the same declared model, environment and settings for a comparison,
with the same frozen case inputs and allowed task. Keep access to treatment
packages out of the baseline context.

Each frozen `limits.seconds` is an integer from 1 through 3,600. The external
executor owns the stopping policy and honest duration record. Preparation only
freezes that declared budget; the CLI does not launch or terminate a timed
process.

Retain actual outputs, relevant transcripts or tool evidence, and an independent
evaluator's grading against the frozen criteria. A criterion marked `pass` must
cite at least one retained verified artifact. Missing official conformance or
another required check is `blocked` or `not-run`; it cannot be converted into a
readiness or passing claim. Preserve the collision fixture when the case requires
refusal, and retain evidence that the prohibited replacement did not occur.

Execution declarations have three distinct kinds:

- `fixture`: synthetic data used to exercise the evidence tooling.
- `manual`: a human-operated exercise.
- `agent`: an externally executed agent exercise.

These kinds remain visible in imports and reports. Passing a fixture test does
not establish agent behavior, and a manual exercise does not establish model
performance. The CLI verifies retained bytes and internal consistency; it does
not authenticate a model session, evaluator, author, host or provider. A caller's
`agent` declaration remains an assertion even when every artifact digest is
valid.

## Import an immutable run

```sh
node bin/index.mjs benchmark import-run \
  --benchmark ../skill-lifecycle-synthetic-v1 \
  --run ../candidate-run/run.json \
  --artifacts ../candidate-run/artifacts
```

All three flags are required. The run JSON uses schema version 1 and identifies
the benchmark digest, frozen case, `baseline` or `treatment` variant, and attempt.
Attempts run from 1 through the frozen case's declared limit, at most 5. Import
rejects a second run ID for the same case, variant and attempt, so a later import
cannot replace an earlier observation with a preferred result.
It declares `execution.kind`, `execution.status`, executor, model, environment,
settings and whether the context was fresh. The status is `executed`, `blocked`
or `not-run`. Non-executed runs cannot claim passing criteria.

The run also declares metrics, artifacts, a verdict and reason for every frozen
criterion, an evidence-path array for each criterion, and limitations. Evidence
may be empty for a non-passing verdict. Criterion verdicts are
`pass`, `fail`, `blocked` or `not-run`. Unknown metrics are JSON `null`, not an
invented zero. Artifact entries declare a relative path, exact SHA-256 and byte
count; imports verify each declared file before retaining it.

This complete JSON template uses the actual `plan-overlap-refactor` case and all
seven of its criterion IDs. It represents a fixture that was **not run**, with no
artifacts, measurements or passing claims. The 64-zero `benchmark_sha256` is a
placeholder; replace it with the exact `benchmark_sha256` returned by preparation.
It cannot be imported unchanged against a real freeze.

```json
{
    "schema_version": 1,
    "id": "refactor-fixture-not-run-example",
    "benchmark_sha256": "0000000000000000000000000000000000000000000000000000000000000000",
    "case_id": "plan-overlap-refactor",
    "variant": "baseline",
    "attempt": 1,
    "execution": {
        "kind": "fixture",
        "status": "not-run",
        "executor": "unexecuted documentation template",
        "model": null,
        "environment": null,
        "settings": null,
        "fresh_context": false
    },
    "metrics": {
        "wall_time_ms": null,
        "input_tokens": null,
        "output_tokens": null
    },
    "artifacts": [],
    "criteria": [
        {
            "id": "current-map",
            "verdict": "not-run",
            "reason": "Documentation template; no current-map exercise or grading was performed.",
            "evidence": []
        },
        {
            "id": "justified-boundary",
            "verdict": "not-run",
            "reason": "Documentation template; no architecture or naming decision was evaluated.",
            "evidence": []
        },
        {
            "id": "resource-disposition",
            "verdict": "not-run",
            "reason": "Documentation template; no delivered resource dispositions were inspected.",
            "evidence": []
        },
        {
            "id": "consumer-transition",
            "verdict": "not-run",
            "reason": "Documentation template; no consumer transition plan was evaluated.",
            "evidence": []
        },
        {
            "id": "ordered-plan",
            "verdict": "not-run",
            "reason": "Documentation template; no ordered implementation or rollback plan was evaluated.",
            "evidence": []
        },
        {
            "id": "plan-only",
            "verdict": "not-run",
            "reason": "Documentation template; no fixture-byte comparison or write-boundary inspection was performed.",
            "evidence": []
        },
        {
            "id": "check-honesty",
            "verdict": "not-run",
            "reason": "Documentation template; no executor check record was evaluated.",
            "evidence": []
        }
    ],
    "limitations": [
        "Unexecuted fixture template, not agent evidence.",
        "The all-zero benchmark digest is a placeholder, not a prepared benchmark identity."
    ]
}
```

For an actual run, use the prepared digest and a permitted unused run identity,
declare the real execution kind/status and known configuration, retain the real
outputs, and supply each artifact's relative path, SHA-256 and byte count. Replace
the template's criterion entries with grades grounded in those retained
artifacts; every `pass` needs a verified evidence reference. Keep genuinely
unknown metrics `null`. The template itself is neither agent evidence nor a
grading result.

An imported `not-run` fixture still occupies its case/variant/attempt slot. Use
a separate prepared demonstration benchmark for a fixture walkthrough; do not
expect to replace that receipt with a later real execution.

Import creates a new `runs/<run-id>` directory containing `run.json`, a
`receipt.json` with `run_sha256`, and the verified `artifacts/<path>` files. It
refuses duplicate IDs and existing destinations. Earlier run data and receipts
are not overwritten. This is an append-only command contract, not an operating
system write-protection claim: later edits by the workspace owner are detected
when the benchmark is verified. To record another observation for the same case
and variant, use another permitted attempt with a new run ID, or prepare a new
benchmark freeze. Do not edit an imported receipt.

The JSON import response identifies the benchmark, run digest, retained artifact
count, declared execution kind/status, and verification result. This result
means the declared artifacts were checked and retained; it is not proof that an
agent executed the case or that an evaluator's verdict is correct.

## Compare retained evidence

```sh
node bin/index.mjs benchmark compare \
  --benchmark ../skill-lifecycle-synthetic-v1
```

Comparison is read-only. It rechecks frozen inputs, imported run receipts and
retained artifacts before deriving the report. Each pair binds the same frozen
case and attempt. A complete controlled comparison requires both arms to be
declared agent executions with known equal model, environment and settings,
fresh contexts, and complete pass/fail grading. Two unknown configuration values
do not establish comparable conditions. Fixture, manual and unexecuted coverage
remain separately visible.

A successful comparison command returns status zero even when its report is
`incomplete` or contains a failed treatment. The process status indicates that
the report was computed and its retained bytes verified. Inspect the result
fields for an acceptance decision; this command is not an automatic quality gate.

The report distinguishes these fields:

| Field | Meaning |
| --- | --- |
| `comparison_status` | `complete` or `incomplete` controlled-comparison coverage. |
| `observed_treatment_result` | Critical-criterion verdicts summarized as `pass`, `fail` or `blocked`; noncritical failures stay visible in `criteria`. This is not a readiness verdict or authenticated agent result. |
| `coverage` | Expected pairs, imported/missing runs, paired cases, declared agent/controlled-agent pairs, and fixture/manual/unexecuted runs. |
| `cases` | Each case/attempt's run IDs, comparability reasons, critical failures in either arm, criterion changes, reported metrics and run limitations. |

Each case also exposes `reported_budget` with `seconds_limit`,
`baseline_within_limit` and `treatment_within_limit`. A known wall-time overrun
keeps the run available for inspection and makes its comparison incomplete and
not controlled, with an explicit comparability reason. An unknown duration
produces `null` budget compliance; it cannot establish that a deadline was met.

Case-level results can also be `not-run`. Criteria expose `improved`, `regressed`,
`unchanged` or `not-compared`; incomplete conditions must remain explicit.
An observed treatment `pass` means its critical criteria passed, not that every
criterion passed. A complete comparison still requires every criterion to have
an executed pass/fail verdict.

Read missing pairs, non-executed runs, blocked criteria, comparability limits and
critical failures before interpreting any metric. A failure of a critical
criterion must remain visible even if other criteria pass. Missing or blocked
evidence is not a passing result and must not be hidden by an aggregate score.

`wall_time_ms`, `input_tokens` and `output_tokens` are caller-declared metrics.
Each is an integer from 0 through 1,000,000,000 or `null`. Keep unmeasured values
`null`. The report retains each arm's declared metrics and
does not calculate metric deltas, latency, costs or a generic quality score.
Wall time may include orchestration, operator work, tools and waiting; it is not
inference latency. Token counts are not authenticated provider usage or billing
evidence.

A comparison describes these retained observations under their declared
conditions. It does not establish causality, statistical significance, general
skill quality, production readiness or coverage across hosts/providers. One
paired agent exercise remains one observation. Official structural validation,
behavioral evaluation, native-host integration and publication are separate
evidence boundaries.

## First retained agent exercise

The first exercise on 2026-10-04 used the four frozen cases and nine selected
packages from collection commit
`c75f53d74066ed756a5c4b8736b2f83769279cec`. Each case had one baseline and one
treatment attempt in separate ephemeral Codex CLI contexts, using the same
declared `gpt-6.1-sol` model and high reasoning setting. The selected packages
were supplied manually to the treatment; this was not an installed-plugin test.

| Case | Baseline criteria passed | Treatment criteria passed | Material observation |
| --- | --- | --- | --- |
| Creation | 7/7 | 6/7 | Treatment reached its 600-second deadline before producing the required authoring record. |
| Refactoring | 6/7 | 2/7 | Both attempts reached the 300-second deadline. Baseline claimed a post-output check absent from its trace; treatment produced no plan. |
| Additive migration | 6/6 | 6/6 | Both preserved source bytes and retained independently retrieved synthetic Git baselines; official readiness remained blocked. |
| Collision refusal | 5/5 | 5/5 | Both refused replacement and preserved the occupied destination. |

All eight real attempts were imported with verified retained artifacts. All 64
fixture instances remained unchanged. The comparison reports four paired cases,
two declared controlled pairs, `comparison_status: incomplete` and
`observed_treatment_result: fail`. These observations do not establish that
adding skills improves or worsens general performance. The failed and partial
deliveries remain evidence for future bounded tuning and a new acceptance gate.

The evaluators did not execute these cases, but knew the condition labels and a
rubric author participated. Common runtime/system guidance remained in both
arms. Invocation-only host-discovery suppression and disabled hooks/plugins
limited candidate-package contamination; native startup and login-shell
behavior prevent an OS-isolation claim. Wall times include startup, tools and
waiting. An initial outer-sandbox startup failure preceded any model execution;
the unchanged freeze was then run with permission for the normal runtime.

The [public method and artifact lineage](https://github.com/i-9-ai/skills/blob/main/benchmarks/behavioral/pilot-2026-10-04/method.json)
links the [comparison](https://github.com/i-9-ai/skills/blob/main/benchmarks/behavioral/pilot-2026-10-04/comparison.json)
and independently graded workproducts. This is a privacy-reviewed derived view:
owned absolute paths and the local username become explicit portable markers, tool events are projected,
and original/public hashes record that transformation. Slash-separated dependency
prose is expanded where it would resemble a private path. Workproducts are retained
under `runs/<case>-<variant>/workproducts/` with a final `.txt` suffix so generated
packages, Markdown pages and scripts stay inert; grading references retain their
original `workspace/` artifact names. Normalized views of run declarations and
their original receipt digests are also retained. Raw JSONL, operational stderr and binary history
artifacts remain local; the public view cannot replace or fully replay those
original imports. No timed-out attempt was rerun or selected away, and the
criteria and candidate packages were not tuned after observing results.

## Bounds and failure recovery

The implementation limits JSON to 512 KiB, an individual file to 4 MiB, a freeze
to 32 MiB and 2,048 files, a suite to 16 cases, each case to 64 criteria and 64
fixtures, selected packages to 16, imported runs to 160, and comparison artifact
work to 64 MiB. Each run allows 32 MiB of artifacts, with `run.json` and
`receipt.json` each bounded separately at 512 KiB. Import rejects a prospective
aggregate above 64 MiB before creating the new run. These are input/work
boundaries, not a host isolation guarantee.

Invalid schemas, unsafe entries, unrelated identities, existing output,
incomplete criteria, changed bytes and receipt disagreements fail with a
nonzero status. Retain the original evidence, correct the external input, and
use a new output or run identity where required. Do not repair an imported result
by editing its frozen files or receipt. Preparation and import do not remove
unrelated data, and comparison does not write evidence.

None of these commands runs model or case scripts, installs a package, enables a
hook, registers a host, or reads/writes a telemetry database. Case execution and
grading require separately authorized external work. Quality receipts in memory,
recurring native-host pilots and an independent collection/module pilot remain
separate follow-up deliveries.

See [Validation](https://github.com/i-9-ai/skills/wiki/Validation) for structural
conformance, [Lifecycle policy](https://github.com/i-9-ai/skills/wiki/Lifecycle-Policy)
for maturity decisions, and [Pilot evaluation](https://github.com/i-9-ai/skills/wiki/Pilot-Evaluation)
for separately recorded historical exercises.
