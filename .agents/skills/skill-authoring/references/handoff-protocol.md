# Handoff protocol

Use one isolated directory per run. The creator owns `run.json`; specialists return artifacts and never edit each other's outputs. Choose a destination within the user's authorized workspace. Run evidence can contain private inputs and must not be committed without sanitization.

Resolve each companion from the host's available skills or a caller-supplied trusted path. Packages may be installed globally, locally, or in different directories; the creator's installation does not supply its companions. Record the selected identities in the run's reports. A missing required companion blocks that handoff, while a specialist used alone returns its own report directly to the caller.

## Manifest

The canonical machine contract is implemented by the package's Node.js helper, documented in [tooling](tooling.md). The schema is deliberately small:

| Field | Meaning |
| --- | --- |
| `schema_version` | Integer `1` |
| `run_id` | Stable lowercase slug for this run |
| `goal` | The user's single intended outcome |
| `target_skill` | The output package's lowercase slug |
| `status` | `draft`, `blocked`, or `validated` |
| `sources` | Source records described below; empty when no external source is used |
| `stages` | Ordered records: `intake`, `discovery`, `synthesis`, `design`, `authoring`, `evaluation` |

A source record contains `id`, `uri`, `revision`, `license`, and `reuse` (`pattern`, `adapt`, `reference`, or `reject`). The URI identifies the package, not only its repository. Use an immutable commit for external sources; record unknown rights honestly and exclude that source from copying. `adapt` requires an immutable revision and known license. Pattern reuse means an independently implemented idea; it is not a way to relabel copied code.

A stage record contains `name`, `status` (`passed`, `skipped`, or `blocked`), a nonempty `summary`, and `artifacts`: objects with `path` and lowercase `sha256`. Paths are relative to the run directory. Artifacts must be regular files inside that directory; symlinks, traversal, absolute paths, and missing or changed bytes fail validation. Each passed stage has at least one nonempty artifact.

## Stage contracts

| Stage | Producer | Required artifact content | Consumer |
| --- | --- | --- | --- |
| Intake | `skill-authoring` | Goal, responsibility, constraints, authority, acceptance criteria, budget | `skills-discovery` |
| Discovery | `skills-discovery` | Queries, pinned candidates, inspected inventory, licenses, decisions, gaps | `skills-synthesis` |
| Synthesis | `skills-synthesis` | Contribution matrix, conflicts, resource plan, rejected material | `skill-design` |
| Design | `skill-design` | Chosen interface, non-goals, resources, acceptance cases, assumptions | `skill-authoring` |
| Authoring | `skill-authoring` | Package inventory, exact identity, license/notice decisions, structural checks | `skill-evaluator` |
| Evaluation | `skill-evaluator` | Frozen cases, candidate/baseline, actual outcomes, critical findings, limitations | `skill-authoring` final handoff |

The manifest verifies integrity and order, not the truth of these reports. A recorded `validated` state requires human or agent evaluation of their actual content, including a successful official `skills-ref validate` result for the exact candidate with its tool identity. Missing official execution leaves evaluation and readiness blocked. The manifest checker does not execute the official tool or infer its result from an exit code of the custom helper. A validated run does not authorize an installer, publisher, or release process.

When needed, `skill-naming` returns a naming decision as an additional intake or design artifact. It does not add a stage to this schema, own the manifest, or apply the rename.

## Transitions, failures, and resume

Append stages in order after checking their output. With fewer than two distinct contributing sources (`pattern` or `adapt`), mark synthesis `skipped` and explain why; references and rejected candidates do not satisfy the two-source minimum. Mirrors or two revisions of the same source do not count twice. The other required stages must pass before a run is `validated`.

On a blocked stage, set the run to `blocked`, retain the partial artifacts, and stop dependent work. Distinguish missing evidence, missing capability, incompatible license, unresolved user choice, and test failure. An unexecuted evaluation is not a pass. Keep incomplete work `draft` when it has no known blocker.

On resume, compare the brief and package identity with the current request, then verify each artifact's bytes. If any input or output changed, invalidate that stage and all dependent stages; preserve prior evidence separately in the private run workspace and rebuild the current manifest from the last verified stage. Do not merely recompute hashes to conceal a changed result. Default to two correction rounds, with the budget recorded in intake.

## Sequential and delegated execution

Sequential execution is the portable reference path: read the selected companion's actual `SKILL.md`, give it the minimum inputs, perform its bounded procedure, and return its artifact to the creator. A companion name alone is insufficient when multiple packages use that name.

Where available and authorized, delegate independent source inspections or evaluation cases. Each worker receives the goal, constraint/authority summary, required output path, raw inputs, and stopping condition. It writes only to its own workspace and returns evidence, gaps, and readiness. The creator reconciles disagreements and verifies artifact hashes. Do not parallelize dependent design/authoring work or let workers independently publish, install, merge, or mutate shared packages.

For a concrete format example, inspect [the synthetic run](../examples/merge-run/run.json). Its reports are explicitly illustrative and are not production evidence.
