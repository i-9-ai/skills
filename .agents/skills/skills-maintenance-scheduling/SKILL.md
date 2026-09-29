---
name: skills-maintenance-scheduling
description: Use to turn an approved recurring maintenance goal for a bounded skill collection into an approval-ready schedule proposal. It does not configure a scheduler or execute maintenance.
license: Apache-2.0
compatibility: The core is text-only; the optional proposal validator requires Node.js 22 or later.
metadata:
  author: i-9-ai
  tags: "governance, maintenance, scheduling, skills"
  source: original
  source_url: "https://github.com/i-9-ai/skills"
  reasoning-effort: medium
---

# Skills Maintenance Scheduling

## Responsibility and boundary

Turn one approved recurring maintenance goal for a bounded skill collection into one reviewable schedule proposal, or return `none` when recurrence is not justified. The proposal records how maintenance evidence could be gathered and reviewed; it does not itself run an audit, change a skill, configure a scheduler, approve work, install packages, merge, or publish.

Use this skill for cadence and authority design. Use the relevant maintenance capability for the work performed by a future run, and a verified host adapter for separately authorized scheduler configuration.

## When to use

- A maintainer wants a periodic collection audit, evidence refresh, evaluation, evolution review, or lifecycle review.
- Existing maintenance work needs a bounded cadence, executor, evidence destination, stop rule, and rollback path.
- A caller explicitly asks to prepare or configure a recurring maintenance schedule while preserving a separate approval gate.

## When not to use

- A one-time audit or repair is already due; route directly to the applicable maintenance capability.
- The target is every installed skill, an unspecified home directory, or another unbounded inventory.
- The request expects unattended modification, approval, installation, merge, publication, or secret storage.
- The task is generic job scheduling unrelated to skill maintenance.

## Inputs and dependencies

Require:

- the approved maintenance goal and the decision that a proposal may be prepared;
- an exact collection identifier, revision or digest, explicit package inventory, and exclusions;
- the evidence freshness need or risk that may justify recurrence;
- the project-local scheduler, approval system, evidence destination, and owner when known;
- a stopping condition and rollback expectation;
- whether scheduler configuration is separately authorized.

Treat approval to design a cadence as proposal authority only. Inspect scheduler and approval mechanisms inside the caller-selected project or supplied records; do not scan user-level configuration, invent a provider, or assume a familiar host is present. Locate optional companion capabilities through the host's actual package inventory or a trusted explicit path. Their absence does not invalidate a proposal when a manual evidence route is possible.

Resolve bundled resources from this installed package and write proposals in the caller's selected workspace. Never place credentials, tokens, private operational inventory, or personal records in a proposal.

## Procedure

1. **Decide whether recurrence exists.** Compare the maintenance goal with its risk and evidence-freshness window. Return `none` with a reason when the work is one-time, event-only, already covered by an existing schedule, or too weakly supported to recur.
2. **Freeze the target.** Record the collection identifier, immutable revision or digest, explicit package list, and exclusions. Reject wildcards, `all installed skills`, moving labels such as `latest` or `HEAD`, and targets whose owner cannot be identified.
3. **Inspect local mechanisms read-only.** Check only project-local instructions, schedule manifests, approval records, and caller-supplied evidence. Classify the scheduler as `existing`, `not-found`, or `ambiguous`. Record the real executor rather than a product name alone. Identify the existing approval system or state that manual review is required.
4. **Choose the least-frequent useful cadence.** Start from the evidence-freshness need and increase frequency only when the stated risk requires it. Record a portable interval, a human-readable trigger, and the rationale. A cadence never grants action authority.
5. **Choose the maintenance route.** Select only capabilities justified by the goal and present them as handoffs. Typical routes are:
   - collection integrity or drift to `skills-audit`;
   - raw observations to `skill-evidence-collection`;
   - behavior evidence to `skill-evaluator`;
   - supported package changes to `skill-evolution` after approval;
   - maturity or deprecation evidence to `skill-lifecycle-review`.
6. **Set execution and authority.** Prefer `proposal-only`. Use `read-only-evidence` only when the proposed executor has that existing authority. Every proposal must state that the scheduled run cannot approve, modify, install, merge, or publish and that cadence grants no additional authority.
7. **Set evidence, stopping, and rollback.** Name the evidence owner, caller-owned destination, required artifacts, maximum run count, failure behavior, stop condition, scheduler-removal path, and evidence-retention path.
8. **Handle configuration requests.** Without explicit configuration authorization, set configuration to `not-authorized` and stop after the proposal. With explicit authorization and a verified existing scheduler, set it to `explicitly-authorized`, name the verified adapter, and require a configuration receipt. If the scheduler is missing or ambiguous, return `blocked`; do not add a framework or guess an adapter.
9. **Validate and review.** Write the proposal using the [schedule contract](references/schedule-contract.md). Check it manually, or run the optional validator below. Review the complete artifact before handing it to an approval or scheduler adapter.

## Optional deterministic validation

With Node.js 22 or later, run:

```sh
node "<installed-skill>/scripts/validate_proposal.mjs" "<proposal.json>"
```

The helper reads one regular JSON file of at most 256 KiB, validates the bounded contract and authority invariants, writes nothing, starts no process, and makes no network request. It rejects linked or changed input files, ambiguous revisions, wildcard packages, credential-bearing fields, automatic approval, cadence-derived authority, and configuration requests without an existing scheduler and receipt requirement. Manual review is the fallback when Node.js is unavailable; record that the helper was not run.

## Automation authority

The proposal must state:

- **execution mode:** `proposal-only` or explicitly authorized `read-only-evidence`;
- **trigger:** calendar, event, or hybrid description plus minimum interval;
- **real executor:** the project runner, owner, or manual operator that would perform the route;
- **side-effect authority:** five explicit `false` controls for approval, modification, installation, merge, and publication, plus `cadence_grants_authority: false`;
- **evidence owner and destination:** who reviews what and where the caller retains it;
- **stop condition:** when runs cease, including a bounded maximum;
- **rollback:** how to remove an authorized scheduler entry and what happens to evidence.

A scheduled run may gather evidence or propose work only within its declared mode. Any package change or external action requires its own current authorization and review.

## Handoffs

- When the route names a maintenance capability, pass the frozen target, goal, allowed mode, evidence destination, and schedule run identity. Expect its bounded report or candidate, then return that artifact to the stated approval owner. Do not invoke or install a missing capability silently.
- When configuration is explicitly authorized, pass the validated proposal to the verified host scheduler adapter. Expect an exact configuration receipt and compare it with the proposal before reporting configured state. The adapter must preserve every authority control and stop rule.
- When a run produces a change candidate, pass it to the project's existing review and approval system. A schedule occurrence, clean audit, or validator pass is not approval.

## Output and acceptance

Return one JSON artifact with `decision` equal to `propose`, `none`, or `blocked`. A proposal includes the target, maintenance goal, recurrence, scheduler and executor, authority, route, evidence owner and destination, stopping rule, and rollback path. A blocked artifact may set `target` to `null` only until its bounded identity is established; retain `reason` and one `required_action`. Use the bundled synthetic examples for [an existing scheduler](examples/existing-scheduler.json), [no local scheduler](examples/no-scheduler.json), [explicit configuration authority](examples/configure-authorized.json), and [no recurring need](examples/no-recurring-need.json).

Accept a proposal only when the target is bounded, the cadence is justified and least-frequent, the real executor is named, all side-effect controls remain false, evidence has an owner and destination, configuration authority is explicit, and the stop and rollback paths are actionable. Default to one correction round after validation; unresolved target, authority, scheduler, owner, or secret-handling defects return `blocked`.

`metadata.reasoning-effort: medium` recommends careful authority and cadence comparison. It does not select a model, invoke a scheduler, or expand permissions.

## Failure and rollback

Preserve any valid proposal and evidence already produced. Return `blocked` with the one required action when the target is ambiguous, configuration was requested without a verified scheduler, the approval owner is missing, or the artifact would contain a secret. Abandoning an advisory proposal has no external rollback. For configured schedules, the named adapter must remove only the recorded entry and return a removal receipt; preserve or delete evidence according to the caller's stated retention policy.
