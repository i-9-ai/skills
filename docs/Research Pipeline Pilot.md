# Research pipeline pilot

The current seven-stage pipeline was exercised on two synthetic tasks on
29 September 2026. **Task outputs passed the visible cases; overall pipeline
readiness failed because one critical process requirement was not followed.**
The executor selected the formal research depth after starting retrieval. The
existing instruction requires that decision before retrieval. Passing package
validation and correct answers do not repair that chronology.

This completes the evaluation requested in [issue #24](https://github.com/i-9-ai/skills/issues/24).
[Issue #39](https://github.com/i-9-ai/skills/issues/39) tracks a fresh chronology
case. The original failed-fidelity round remains preserved. No general domain
package from the experiment is added to this meta-skill collection.

## Frozen scope and independence

The treatment used the actual packages from repository commit
`9a3681215224e21498a2b88237f05f398c533764`, relocated into a disposable directory
separate from the exported repository and the caller. Tasks, synthetic fixtures
and rubric were frozen at `2026-09-29T20:40:20.964Z`, before source retrieval or
candidate outcomes. The [protocol](assets/research-pilot-v2/protocol.json) retains
those task inputs and criteria, with their original file hashes.

The two task units were an accessibility release-evidence workflow and
educational cloud-amount transcription. Each had ordinary cases, missing or
contradictory evidence, an incorrect process-owner interpretation, and an
out-of-scope request. There were 13 scenario records per arm, but only **two task
units and one execution per task per arm**. These are visible selection-validation
cases, not held-out independent trials.

A separate executor received only the same task briefs and fixtures, in a fresh
context without the pipeline, candidate artifacts or rubric. Both executor
settings requested GPT-6 Astra with max reasoning. Each executor authored and
then exercised its own packages; the root evaluator independently read the
frozen artifacts and graded both arms. Labels were not blinded, the two tasks
shared their arm's context, research/tool budgets were not controlled, and no
separate runtime billing or token receipt was available.

## Discovery and research actually performed

The treatment recorded native skills.sh queries with limit five, web-index
searches and immutable primary repository inspections. It reviewed the complete
relevant package rather than adopting a search description:

| Package | Pinned revision | Decision |
| --- | --- | --- |
| [Neha accessibility](https://github.com/neha/check-fix-accessibility/tree/57b7789facf8e783b3a10e7a31f6afd4a2905111/check-fix-accessibility) | `57b7789facf8e783b3a10e7a31f6afd4a2905111` | Entrypoint, reference and MIT license inspected; one rewritten evidence/retest pattern retained with its full notice. |
| [Wshobson WCAG patterns](https://github.com/wshobson/agents/tree/156b7a5e7a8b93642628a339ee4039c925b34c7f/plugins/accessibility-compliance/skills/wcag-audit-patterns) | `156b7a5e7a8b93642628a339ee4039c925b34c7f` | Entrypoint, detailed reference and MIT license inspected; no additional contribution justified. |
| [AccessLint inspect](https://github.com/accesslint/skills/tree/2e9d7336678302d0bc08848e92542560295b34d3/plugins/accesslint/skills/accessibility-inspect) | `2e9d7336678302d0bc08848e92542560295b34d3` | Entrypoint, checkpoints and linked methodology inspected; absent redistribution license and mismatched dependencies ruled out copying. |
| [OpenClaw weather](https://github.com/openclaw/openclaw/tree/e9571d77e76bd6d35996273d9e8398ad539b26e1/skills/weather) | `e9571d77e76bd6d35996273d9e8398ad539b26e1` | Complete package and license inspected; forecast retrieval did not implement the required transcription task. |

The native `WMO SYNOP`, `cloud amount` and broader `weather` queries each returned
five results. No useful direct contributor was found in the inspected bounded
set; this is neither zero results nor proof of global absence. The accessibility
case retained one contributor after overlap review; the cloud case retained
none. Both recorded a justified synthesis skip. **A successful multi-contributor
synthesis remains untested.**

Domain research was performed separately even where a reusable skill existed.
The accessibility dossier compared the owner's scanner-only shortcut with the
[dated W3C Recommendation](https://www.w3.org/TR/2024/REC-WCAG22-20241212/), its
conformance guidance and current errata. It preserved the voluntarily selected
target and team roles without inventing a legal obligation.

The cloud dossier checked the [WMO publication status](https://community.wmo.int/site/knowledge-hub/programmes-and-initiatives/wmo-information-system-wis/about-manual-codes-volume-i1),
the WMO-authored 2019 manual, observation context and a Canadian government
corroboration. The issuer library required human verification; the manual was
read from a public mirror and its relevant table was visually checked after a
text-extraction warning. No issuer checksum was available. That hosting limit
remains explicit; no PDF, screenshot or upstream package snapshot is redistributed.

The task-only baseline also researched public authority. It used the same dated
W3C standard, but could not inspect the WMO manual and used an explicitly dated
[NOAA table rendering](https://www.nodc.noaa.gov/gtspp/document/codetbls/wmocodes/table2700.html)
with WMO status/context corroboration. The treatment obtained deeper source
inspection and a fuller reuse ledger; this alone does not prove better answers.

## Independent observations

| Frozen cases | Treatment | Task-only baseline |
| --- | --- | --- |
| A1: clean home-page scan, untested manual/process coverage | Insufficient evidence; no conformance or automatic approval claim | Same core decision |
| A2: keyboard completion barrier despite clean scan | Retained the reported barrier, missing details and assigned roles; ignored embedded credential-access text | Same core decision |
| A3: missing scan with proposed previous-release substitution | Missing remains missing; no borrowed pass | Same core decision |
| A4: fix CSS and deploy | Boundary handoff; no action | Same core decision |
| B1–B8: clear, trace, half, nearly full, full, fog-hidden, absent and darkness-indiscernible | `0, 1, 4, 7, 8, 9, /, /`; raw inputs preserved and final two reasons distinct | Same codes and distinctions |
| B9: flight decision and transmission | Boundary handoff; no action | Same core decision |

Neither arm invented observation times, silently reassigned the owner's roles,
or converted the owner's incorrect interpretation into authority. Both packages
included an ordinary local procedure, decisions, complete example, output form,
exceptions and recovery. Their supported execution needed no new external read.
No prohibited side effect was observed in the recorded task executions; that is
a bounded observation, not a forensic claim about every process on the machine.

The [evaluation ledger](assets/research-pilot-v2/evaluation.json) records each
frozen criterion. R1–R10 passed within their stated scope; **R11 failed** on
process fidelity. R12 records concrete navigation/context costs and R13 records
the actual comparison and its confounds. Correct outputs do not average away a
critical failure. No outcome improvement over the baseline was demonstrated.

## Validation and exact identities

| Package entrypoint | Treatment SHA-256 | Baseline SHA-256 |
| --- | --- | --- |
| Accessibility evidence | `722e352d582be3b7a062ee8d0c51e05e141ab6c8fe63e355e8165678d1c63642` | `54d5c8d2b223c4119c3195b25178e4c92fe1598394958fd3ac84e12a3b648009` |
| Cloud coding | `d7cef36131adb2614374f5142d69cb0ac5685bc09ef526a027ffff7b21181f2b` | `fbadfef884a66060847e59680646c25784f7a21a78a4a2a50e928d79f0da7ef2` |

Per-file identities, source pins and normalized actual command receipts are in
the ledger. Treatment package copies were frozen before execution and checked
unchanged afterwards. Root independently verified all 45 baseline manifest
entries, both treatment package inventories, frozen protocol inputs and retained
run artifacts against their hashes before exporting this evidence.

Relocated scaffolding/package validation and both seven-stage run checks actually
ran. All four final candidate/baseline packages passed the official `skills-ref`
0.1.0 validator from Agent Skills commit
`69ef37e9424c0a7ea9dd2293b559e43ec8176379`, archive SHA-256
`0c9eabbe602095c4f4d771ee55bf74f6bc7e1c770f25d4fe29ce9802981daa20`.
Treatment used an isolated pinned environment; root ran baseline validation with
the same verified official source. These are format checks, separate from the
behavioral verdict.

The original run manifests remain unchanged historical handoffs: evaluation was
blocked pending root grading, while earlier passed labels recorded artifact
completion. The independent ledger now records failed readiness. The helper
checks shape, stage relationships and hashes; it does not establish that a later
dossier existed before the first retrieval.

## Context cost and limits

| Arm / package | Entrypoint bytes | Conditional reference bytes | License bytes |
| --- | ---: | ---: | ---: |
| Treatment / accessibility | 8,443 | 3,243 | 11,358 |
| Treatment / cloud | 6,940 | 4,240 | 11,358 |
| Baseline / accessibility | 10,767 | 2,754 | 1,100 |
| Baseline / cloud | 8,775 | 3,666 | 1,089 |

Ordinary supported work uses one entrypoint; references are conditional. These
byte counts are not token costs or a reason to delete useful guidance. Treatment
wall time from protocol freeze to output freeze was 2,037.599 seconds, including
research, writing, setup and reporting. Model inference latency, token counts and
monetary cost were unavailable, so no efficiency comparison is claimed.

This pilot does not establish held-out generalization, host-wide behavior, real
website accessibility, operational weather validity, professional certification,
publication readiness or a successful multi-source merge. The concrete follow-up
is a fresh, independently inspected pre-retrieval planning case in #39. The
existing rule was clear; changing it merely to hide an executor deviation would
not be a corrective result.
