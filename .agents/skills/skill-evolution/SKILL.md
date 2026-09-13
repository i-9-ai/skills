---
name: skill-evolution
description: Use to update one existing skill from new evidence while preserving its responsibility, provenance, compatibility, and a reviewable change record.
license: Apache-2.0
metadata:
  author: i-9-ai
  tags: "skills, evolution, maintenance"
  source: original
  source_url: "https://github.com/i-9-ai/skills"
  reasoning-effort: high
---

# Skill Evolution

## Responsibility and inputs

Evolve one existing skill from supported new evidence and return an updated candidate with a reviewable evolution record. Accept the current package, its provenance lock, upstream or operational evidence, confirmed constraints, and acceptance criteria.

## Procedure

1. Establish the current package identity, responsibility, version or revision, and frozen baseline. Normal evolution requires a passing baseline; stop if the starting bytes are ambiguous. A repair may start from an inherited known-failing baseline only when the exact failing checks, candidate bytes, and intended repair are frozen in the evolution record. Never label that baseline passing or use it to claim regression preservation.
2. Normalize each new evidence item by source, immutable revision when available, license when relevant, relevance, and confidence. When several raw observations, reports, or audit findings need preservation before this comparison, hand them to skill-evidence-collection and consume its bounded evidence packet. Treat upstream changes as candidates rather than automatic requirements.
3. Classify the evidence and choose its destination using the [evidence promotion guide](references/evidence-promotion.md). Keep weak direction signals as hypotheses or experiment inputs; do not turn them into active instructions.
4. Compare the evidence with current behavior, references, scripts, tests, and boundaries. Record what is already covered, newly useful, incompatible, duplicated, or rejected.
5. Select the smallest supported change that improves the existing responsibility. Apply a clear, local, low-risk correction only when the caller has authorized package edits. When the change requires measured iterative improvement from task outcomes, hand the candidate and frozen evidence plan to skill-optimization; otherwise keep the update evidence-bound and non-iterative. Hand changes affecting evaluation, security, lifecycle state, publication, integration, or structure to the corresponding specialist.
6. Check that the candidate still has the required package structure and interface assets. When an icon is missing, unsafe, duplicated, or no longer represents the responsibility, hand the package brief to skill-icon-design and add its validated SVG small icon and PNG large-icon rendering before validation. Do not improvise an unrelated icon.
7. Update the candidate package and provenance record. Keep reusable instructions compact; move stable detail into references and deterministic work into scripts when justified.
8. Run structural, official, behavioral, compatibility, and security checks required by the package. Bind results to the exact candidate bytes.
9. Return the evolved candidate and an evolution record listing evidence classification, decisions, changed behavior, asset decision, validation, remaining uncertainty, and rollback revision.

## Tools and authority

Use read, comparison, editing, and validation tools within the selected workspace. Source access does not authorize installation, publication, migration, or disclosure. Automated application is allowed only when the caller has authorized package edits and every required gate can be evaluated.

## Output and evaluation

The primary output is one evolved candidate package with its evidence-bound evolution record. Periodic detection of upstream changes may trigger this skill, but scheduling and catalog maintenance remain separate responsibilities. Optimization is a separate measured loop; this skill does not claim its acceptance gate passed.

Pass when the change is traceable to evidence, preserves or deliberately narrows the skill's single responsibility, records provenance and license decisions, passes required gates, and can be rolled back to the identified baseline. For inherited-broken repairs, the candidate must pass the checks that the frozen baseline fails; retain the failure record instead of claiming a normal passing-baseline comparison.
