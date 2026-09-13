---
name: skill-security-review
description: Use to review one skill package for secrets, private data, unsafe instructions, dangerous scripts, dependencies, permissions, and disclosure risk.
license: Apache-2.0
metadata:
  author: i-9-ai
  tags: "skills, security, review"
  source: original
  source_url: "https://github.com/i-9-ai/skills"
  reasoning-effort: high
---

# Skill Security Review

## Responsibility and inputs

Review one skill package for security and disclosure risk and return an auditable pass or block decision. Accept the exact package revision, intended distribution, threat model, supported host capabilities, dependencies, scripts, assets, provenance, and security policy.

## Procedure

1. Freeze the package inventory and revision. Identify executable, networked, credentialed, filesystem, publication, and host-integration surfaces.
2. Inspect all package bytes for secrets, personal or client data, private URLs, local paths, hidden prompts, unsafe instructions, active SVG content, and accidental repository context.
3. Trace scripts and declared dependencies from untrusted inputs to filesystem, process, network, credential, and output sinks. Validate effective controls rather than relying on documentation alone.
4. Check least authority, explicit external-action gates, safe defaults, dependency provenance, immutable pins where justified, bounded inputs, sanitized diagnostics, rollback, and isolation claims.
5. Record supported findings with severity, confidence, evidence, concrete impact, counterevidence, and a remediation owner. Do not include sensitive matched values in the report.
6. Return pass only when no blocking finding remains for the stated distribution. Return block with exact remediation handoffs when risk is unresolved.

## Tools and authority

Prefer read-only static inspection, disposable fixtures, and scoped security tooling. Execute package scripts, contact networks, use credentials, inspect private data, or modify the package only when separately authorized and necessary for validation.

## Output and evaluation

The primary output is one security decision report. General quality belongs to the evaluator; remediation belongs to authoring or evolution; publication consumes this decision but cannot override it silently.

Pass when coverage is explicit, every identified attack surface has a disposition, findings are reproducible without exposing sensitive data, and the decision is bound to the reviewed bytes and distribution context.
