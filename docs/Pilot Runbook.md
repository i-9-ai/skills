# Pilot runbook

## Purpose

Use this runbook to evaluate I-9 Skills against an existing collection without treating a pilot result as a release, publication, or automatic migration. The pilot proves whether the framework can identify a bounded improvement, make it reviewable, and preserve evidence for the next decision.

## Scope

Choose one existing repository and one low-risk skill or small, coherent group of skills. Work only in a dedicated branch or disposable workspace. The pilot may inspect, propose, and validate changes; it must not publish, install packages globally, contact external services, or merge changes unless separately authorized.

## Entry prompt

Give this prompt to an agent with the I-9 Skills collection available:

> Use `skill-routing` to plan a read-only assessment of this repository's skills. Start with `skills-audit`, then return the smallest evidence-based route for one low-risk, high-value improvement. Do not edit files, install packages, publish anything, or access external services. State `none` if no focused improvement is justified.

## Procedure

1. **Route the request.** Use `skill-routing` with the pilot goal, repository constraints, and whether independent work is permitted. Preserve its routing decision.
2. **Audit the collection.** Use `skills-audit` in read-only mode. Record package-contract gaps, mixed responsibilities, catalog drift, security concerns, and coverage limits.
3. **Select one target.** Prefer a clear, low-risk improvement with a concrete acceptance condition. Stop if the audit supports `none`.
4. **Collect evidence.** Use `skill-evidence-collection` to normalize the observations, origin, scope, and strength of the evidence. Keep weak signals marked as hypotheses.
5. **Choose the smallest change path.** Use `skill-evolution` for a bounded evidence-backed improvement. Use `skills-refactoring` only when responsibility boundaries need redesign. Use `skill-design` and `skill-authoring` when a new or rebuilt package is justified.
6. **Prove the candidate.** Run `skill-evaluator` and `skill-security-review`. Validate the package with the official Agent Skills validator and the repository's local checks.
7. **Review and decide.** Produce a concise pilot report that links the original route, audit, evidence packet, candidate diff, validation results, rejected alternatives, and recommendation: accept, revise, defer, or reject.

## Acceptance criteria

The pilot is useful when it produces all of the following:

- one recorded routing decision, including a defensible `none` result when appropriate;
- one evidence-linked audit with stated coverage limits;
- at most one focused candidate change or a documented decision not to change anything;
- separate behavioral, security, and structural validation results;
- no secrets, personal records, customer data, credentials, or private source snapshots in the generated artifacts;
- a human-reviewable recommendation that does not silently publish, install, merge, or expand scope.

## Interpreting the result

A successful pilot does not prove every host, model, or collection will behave identically. It demonstrates one bounded workflow under stated conditions. Capture failures as evidence: an unclear route, missing metadata, inflated responsibility, weak validation, or host incompatibility is useful input for the next focused improvement.

## Related material

- [Skill entry-path map](https://i-9-ai.github.io/skills/skill-management-entry-paths.html)
- [Pilot evaluation](https://github.com/i-9-ai/skills/wiki/Pilot-Evaluation)
- [Validation](https://github.com/i-9-ai/skills/wiki/Validation)
- [Security policy](https://github.com/i-9-ai/skills/blob/main/SECURITY.md)
