---
name: skills-host-compatibility
description: Use to verify declared repository-local aliases for a canonical skill collection and return a bounded structural compatibility report.
license: Apache-2.0
metadata:
  author: i-9-ai
  tags: "skills, compatibility, aliases"
  source: original
  source_url: "https://github.com/i-9-ai/skills"
  reasoning-effort: medium
---

# Skills Host Compatibility

## Responsibility and inputs

Verify declared repository-local discovery aliases for one canonical skill collection and return one structural compatibility report. Use this when a repository must make a single collection discoverable through explicit local paths without creating duplicate editable trees.

Accept a repository root, canonical collection path, and an explicit alias contract. Each declaration identifies an alias `kind` (`skills` or `guidance`), path, required shape, and exact expected target when applicable. The caller may also provide a scope revision and a report destination.

This skill does not infer aliases from directory names, inspect a home directory, install or copy skills, change links, configure hooks, or test a provider runtime.

## Procedure

1. Freeze the scope: repository root, canonical path, declared aliases, expected shapes, revision, and exclusions. Reject a path outside the root or an alias contract without an explicit expected shape.
2. Inspect the canonical path once. Record whether it is present and suitable for the caller's stated collection convention; do not use an alias as a second inventory source.
3. For every declared alias, inspect its entry without following it during collection inventory. Verify the declared kind, shape, and exact target. Classify it as `present`, `missing`, `broken`, `wrong-target`, `duplicate-copy`, or `unsupported-shape`.
4. Detect host-looking skill directories and agent-guidance files that exist in the checked scope but are absent from the declared contract. Classify them as `not-declared`; do not endorse a path merely because its name is familiar.
5. Compare every valid alias with the canonical collection. A valid alias must resolve to the declared target and must not create a separately editable copy. Record relative-target evidence when the contract requires a symbolic link.
6. Return a deterministic report with the scope handle, canonical result, one disposition per declared and observed alias, evidence, limits, and recommended handoffs. State separately that structural agreement does not prove provider discovery, runtime behavior, installation, or global configuration.

## Findings and handoffs

Use these remediation owners when available in the caller's environment:

- A requested approved destination change or user-level setup goes to an installation procedure.
- A canonical-path transition, package move, or consumer cutover goes to a migration procedure.
- Package content, provenance, validation, or policy quality goes to a collection-audit procedure.

Report defects and a reversible recommendation only. Do not repair aliases in this skill. If the declared contract conflicts with an existing repository policy, stop and return the conflict instead of guessing a new alias.

## Output and evaluation

The primary output is one structural compatibility report. Include the repository root as supplied by the caller, canonical path and disposition, normalized declarations grouped by kind, observed aliases, classifications, exact-target evidence, duplicate-inventory policy, limitations, and next owner for each actionable finding.

The report passes when every declared alias has an evidence-backed disposition, every observed but undeclared alias is disclosed as `not-declared`, and the result is reproducible against the same bytes and contract. It does not claim host-runtime compatibility, a successful installation, or universal agent support.

`metadata.reasoning-effort: medium` recommends careful path and contract comparison. It does not select a model, grant filesystem authority, or permit host configuration changes.
