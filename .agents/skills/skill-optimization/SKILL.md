---
name: skill-optimization
description: Use to improve one skill through scored rollouts, bounded candidate edits, and held-out validation. It does not discover sources, author unrelated skills, or publish changes.
license: Apache-2.0
metadata:
  author: i-9-ai
  tags: "skills, optimization, evaluation"
  source: original
  source_url: "https://github.com/i-9-ai/skills"
  reasoning-effort: high
---

# Skill Optimization

## Responsibility and inputs

Improve one existing skill using measurable task outcomes. Accept an immutable baseline package, a scoped task corpus split into tuning, selection-validation, and final-acceptance cases, scoring rubric, execution constraints, and an authorized candidate workspace.

This skill turns scored rollouts into bounded candidate edits. It does not decide whether a skill needs evolution, discover external sources, alter a collection catalog, or publish a candidate. Use skill-evolution to identify supported changes and skill-evaluator to perform a broader readiness assessment.

Read [the optimization loop](references/optimization-loop.md) when creating the run record or adapting a compatible optimizer.

## Coverage before context reduction

Suggested body character, line, and token targets are advisory context budgets. They do not permit omitting procedures, complete examples, exceptions, or quality-critical detail. Verified specification/schema constraints and actual collection validation bounds remain separate requirements; preserve complete task routes through reachable topic resources where necessary. A frozen edit budget limits the search, not the quality floor: return no accepted candidate when the budget cannot accommodate a correct change.

Retain a normal minimal complete example in the entrypoint when it enables immediate implementation. Keep information together when ordinary cases almost always need it together, even if the file is larger. Split independently loaded topics, provider adapters, and advanced branches into focused references with explicit conditions; select only relevant resources. Measure total loaded context and navigation overhead while retaining task coverage. Do not mechanically split by line count, assume references are only for rare detail, or treat self-sufficiency as an optional offline mode.

Preserve useful reviewed source procedures and examples independently of template layout; document justified removals. Evaluate whether the candidate's selected route teaches implementation without relying on model prior knowledge or external lookup. A shorter artifact is rejected when it hides ordinary wiring or loses a required exception.

## Procedure

1. Freeze the baseline identity, task splits, scoring rubric, target environment, cost limit, and acceptance threshold before any candidate result is observed.
2. Run the baseline against the tuning cases and collect only the minimum evidence needed to diagnose outcomes: task identifier, score, relevant artifact, and safe execution trace summary.
3. Reflect on recurring successes and failures. Propose the smallest add, delete, or replacement edits that address a reusable behavior; enforce the recorded textual edit budget.
4. Apply one bounded candidate in an isolated workspace. Preserve the accepted baseline and record the exact diff, rationale, and tuning evidence.
5. Evaluate each candidate on selection-validation cases that did not influence its edit. Use those results only to retain or reject candidates during the bounded search.
6. Store rejected candidates with their reason and affected pattern. Do not retry a materially equivalent edit unless new evidence or a changed constraint justifies it.
7. Stop at the epoch, cost, or non-improvement limit. Select the best retained candidate, then evaluate it once on the untouched final-acceptance cases. Accept it only when that final gate meets the predefined improvement threshold with no critical regression; otherwise return no accepted candidate.

## Tools and authority

Use only authorized execution environments and sanitized, reproducible task data. A compatible optimization engine such as [Microsoft SkillOpt](https://github.com/microsoft/SkillOpt) may be used when the caller explicitly authorizes its installation and execution; it is not required by this skill and does not replace this package's portable contract.

Do not send private rollouts, credentials, client data, or local environment snapshots to an external provider. Do not accept an edit because an optimizer recommends it. The final-acceptance gate is mandatory, and a failed or unavailable gate leaves the candidate unaccepted.

## Output and evaluation

The primary output is one best accepted candidate plus its optimization record. The record identifies the baseline, frozen splits, rubric, run budget, candidate diffs, aggregate scores, accepted revision, rejected changes, limitations, and rollback target.

Pass when every accepted edit is bounded, traceable to tuning evidence, selected using separate validation cases, evaluated once on final-acceptance cases, and demonstrably improves the defined objective without a critical regression. The result is evidence for later lifecycle review; it is not publication, universal portability proof, or permission to replace an installed package.
