---
name: skill-lifecycle-review
description: Use to determine the lifecycle state and next justified transition for one skill from current evidence without editing or publishing the package.
license: Apache-2.0
metadata:
  author: i-9-ai
  tags: "skills, lifecycle, governance"
  source: original
  source_url: "https://github.com/i-9-ai/skills"
  reasoning-effort: medium
---

# Skill Lifecycle Review

## Responsibility and inputs

Determine one skill's current lifecycle state and the next justified transition. Accept the package identity, current state, evaluation and security evidence, installation or usage feedback, open findings, provenance, and the collection's lifecycle policy.

## Procedure

1. Verify that all evidence refers to the same package revision. Separate missing evidence from failing evidence.
2. Assess the current state against the collection's explicit criteria, such as draft, pilot, stable, deprecated, or retired. Do not invent states that the policy does not define.
3. Check whether required structural, official, behavioral, security, compatibility, provenance, and consumer evidence is present and current.
4. Identify the single next transition supported by evidence: remain, promote, deprecate, retire, or return for remediation. A transition may be blocked.
5. Record the decision, supporting and counterevidence, expired evidence, unresolved risks, required owner, and the next review trigger.
6. Return the review without modifying package bytes, catalog status, installation state, or publication state.

## Tools and authority

Use read-only inspection and validation-result verification. A lifecycle recommendation does not authorize catalog mutation, migration, installation, publication, or deletion. Hand an approved status change to the catalog owner and package changes to evolution or authoring.

## Output and evaluation

The primary output is one lifecycle decision record. Pass when the decision is bound to one revision, applies an explicit policy consistently, distinguishes absence from failure, names the next responsible capability, and can choose no transition when evidence is insufficient.
