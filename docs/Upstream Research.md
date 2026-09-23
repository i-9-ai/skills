# Upstream benchmark

Observed on 2026-09-12. This is a static comparison of public primary sources, not a production certification. The source snapshots were inspected without executing their scripts or installing their skills into a consumer.

## Discovery

The cited skills.sh listings were checked directly. Additional indexed searches covered `skills-merger`, `skill-merger`, `merge-skills`, `merge skills`, `skill-creator eval`, `skill evaluation`, `skill-evaluator`, `brainstorming`, and `writing-skills`.

The published Skills CLI version `1.5.26` was also used for two queries, with npm lifecycle scripts disabled: `skills find 'skill creator'` and `skills find 'skill merger'`. The creator query returned Anthropic and other authoring candidates. The merger query returned unrelated memory, code, spreadsheet, specification, and model merging packages; those tasks do not match skill synthesis. No suitable dedicated skill merger was found within this search budget. This is limited search evidence, not proof that none exists.

Install counts, badges, and search order were discovery signals only. No package was labeled production approved based on those signals.

## Pinned sources and decisions

| Source ID | Listing / primary package | Commit | Scoped license | Decision |
| --- | --- | --- | --- | --- |
| `vercel-find-skills` | [skills.sh](https://skills.sh/vercel-labs/skills/find-skills), [package](https://github.com/vercel-labs/skills/tree/d667282815248da03a08a18272b5d2eef9caf77c/skills/find-skills) | `d667282815248da03a08a18272b5d2eef9caf77c` | [MIT, root](https://github.com/vercel-labs/skills/blob/d667282815248da03a08a18272b5d2eef9caf77c/LICENSE) | Reuse discovery ideas; author a bounded qualification procedure |
| `anthropic-skill-creator` | [skills.sh](https://skills.sh/anthropics/skills/skill-creator), [package](https://github.com/anthropics/skills/tree/34040c9c568585f6929bedeaad110ad08f079624/skills/skill-creator) | `34040c9c568585f6929bedeaad110ad08f079624` | [Apache-2.0, package override](https://github.com/anthropics/skills/blob/34040c9c568585f6929bedeaad110ad08f079624/skills/skill-creator/LICENSE.txt) | Reuse authoring and evaluation principles; implement portable helpers independently |
| `superpowers-brainstorming` | [skills.sh](https://skills.sh/obra/superpowers/brainstorming), [package](https://github.com/obra/superpowers/tree/b36e0829c6d0140e93cfef2ca599b1b07d4a7797/skills/brainstorming) | `b36e0829c6d0140e93cfef2ca599b1b07d4a7797` | [MIT, root](https://github.com/obra/superpowers/blob/b36e0829c6d0140e93cfef2ca599b1b07d4a7797/LICENSE) | Reuse design and decomposition ideas, scoped to skill design |
| `superpowers-writing-skills` | [skills.sh](https://skills.sh/obra/superpowers/writing-skills), [package](https://github.com/obra/superpowers/tree/b36e0829c6d0140e93cfef2ca599b1b07d4a7797/skills/writing-skills) | `b36e0829c6d0140e93cfef2ca599b1b07d4a7797` | [MIT, root](https://github.com/obra/superpowers/blob/b36e0829c6d0140e93cfef2ca599b1b07d4a7797/LICENSE) | Reuse baseline and pressure-case ideas |
| `skillport-skill-evaluator` | [skills.sh](https://skills.sh/gotalab/skillport/skill-evaluator), [experimental package](https://github.com/gotalab/skillport/tree/51334ae94919fc1c261673ffefdce9176c9094ef/.skills/experimental/skill-evaluator) | `51334ae94919fc1c261673ffefdce9176c9094ef` | [MIT, root](https://github.com/gotalab/skillport/blob/51334ae94919fc1c261673ffefdce9176c9094ef/LICENSE) | Secondary rubric reference; reject as a production-approved base because it declares WIP |

The [source lock](../upstreams.lock.json) records all 41 files across these five packages, full file inventories and hashes, applicable license hashes, and local consumers. Downloaded bytes were checked against the pinned Git blob identities before SHA-256 capture. Root licenses outside a package are separate evidence; the package digest includes only its files. A hash records byte identity and does not imply that tests ran.

The machine algorithm is `sha256`. Hash each file's exact raw bytes without newline or encoding normalization. Sort package-relative POSIX paths by UTF-8 byte order; concatenate each path, NUL (`0x00`), its lowercase hexadecimal digest, and newline (`0x0A`), then hash those combined bytes for `package_sha256`. Directory entries and file modes are excluded. Licenses outside the package have their own repository-relative path and digest. The offline validator recomputes the aggregate from recorded digests; source-byte verification occurred during capture and requires a fresh fetch to repeat.

## Contribution decisions

| Local consumer | Useful idea | Adaptation or rejection | Local evidence/consumer |
| --- | --- | --- | --- |
| Skills discovery | Task/synonym discovery and primary source links | Replace installation-oriented output with a qualification report and explicit rights/security review | [Source review](../.agents/skills/skills-discovery/references/source-review.md) |
| Creator | Intent, progressive disclosure, realistic outputs | Keep orchestration separate from specialist procedures and require a self-contained license | [Authoring guide](../.agents/skills/skill-authoring/references/authoring.md) |
| Evaluator | Baselines, observable grading, comparison, iteration | Use runtime-neutral execution and separate untouched acceptance cases | [Evaluation rubric](../.agents/skills/skill-evaluator/references/evaluation.md) |
| Skill design | Clarify outcomes, compare approaches, reduce scope | Preserve prior authorization; remove mandatory provider dispatch and unrelated global activation | [Decision guide](../.agents/skills/skill-design/references/decisions.md) |
| Synthesis | Combine traceable source contributions | Original synthesis procedure; reject concatenation, duplicate scripts, unrelated responsibilities, and automatic adoption | [Synthesis guide](../.agents/skills/skills-synthesis/references/synthesis.md) |

The package instructions and helpers are independently authored implementations of selected methodological ideas. No upstream code, UI server, complete prompt, or asset is vendored. Apache-2.0 licenses the original work; a future actual copy/adaptation must preserve its source's required license and notices rather than inheriting this statement automatically.

## Naming basis

Searches on 2026-09-12 covered `skill naming`, `skill-naming`, and `naming-conventions` on skills.sh. The [general naming listing](https://skills.sh/jwynia/agent-skills/naming) led to a [pinned entrypoint](https://github.com/jwynia/agent-skills/blob/e02ec7e226a6e4f8419fd3b88a1d8e472d421b32/skills/general/ideation/naming/SKILL.md) oriented toward brands, products, characters, places, and titles. Its entrypoint scope was inspected for discovery; its full resource tree was not qualified and no material was adopted. Other surfaced platform-specific naming results did not establish a reusable skill-identifier specialist.

`skill-naming` is an original, narrower procedure based on the [Agent Skills name constraints](https://agentskills.io/specification#name-field) and the requested domain-affinity/cardinality convention. It returns one naming decision and scoped collision evidence. The five benchmark packages above remain unchanged; discovery-only candidates are not promoted to benchmark locks or production approvals.

## Findings that affected the design

Anthropic's evaluation helpers invoke a specific CLI and create provider-specific command files; these are unsuitable as the portable execution layer. Its archive helper uses an exclusion list without the explicit path/symlink boundary required here. The new helper performs only scaffolding and validation; it does not execute models or package arbitrary source archives. Its evaluation loop uses a held-out score for selecting iterations, so the local rubric reserves an additional untouched acceptance set before making generalization claims. These observations are scoped to the [inspected scripts](https://github.com/anthropics/skills/tree/34040c9c568585f6929bedeaad110ad08f079624/skills/skill-creator/scripts).

Superpowers' [brainstorm server tests](https://github.com/obra/superpowers/tree/b36e0829c6d0140e93cfef2ca599b1b07d4a7797/tests/brainstorm-server) support that optional UI implementation, not universal design quality. The UI server and provider dispatch rules are not adopted. Its writing-skills testing ideas inform the local evaluator, while the [Agent Skills specification](https://agentskills.io/specification) governs format conflicts: descriptions explain what and when, metadata is a string mapping, and provider tool allowlists are not a portability prerequisite.

Skillport offers rubric and example material but explicitly marks the evaluator experimental and uses model-family-specific evaluation assumptions. It remains a secondary reference; its labels and examples do not establish production readiness for this collection.

## Future evolution

Preserve this baseline until a reviewed change intentionally replaces it. A future comparison can inspect upstream file additions, removals, and modifications against `upstreams.lock.json`, map them to contribution decisions, and propose improvements with evidence. Do not update the lock solely to silence a changed hash, automatically overwrite local work, or treat a newer commit as a quality verdict.

## Agent Skills guidance integration (2026-09-19)

The authoring, design, evaluation, evidence-collection and optimization packages
now include originally written guidance influenced by agentskills/agentskills
revision `69ef37e9424c0a7ea9dd2293b559e43ec8176379`. Reviewed documentation under
`docs/skill-creation/` is CC-BY-4.0; each consumer carries its own immutable
reviewed-file and attribution record. Integration covers sanitized corrections,
control proportional to fragility, noninteractive script interfaces, portable
evaluation cases and description activation errors. Self-contained routes and
untouched final acceptance remain mandatory. No upstream scripts or setup
commands are adopted. Structural validation establishes no measured model gain.
