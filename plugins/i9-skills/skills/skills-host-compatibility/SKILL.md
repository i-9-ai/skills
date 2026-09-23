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

## Optional deterministic check

For a declared symbolic-link contract, use `node scripts/verify_aliases.mjs <contract.json>` with Node.js 24+ from this installed package. The JSON contract contains `root`, `canonical_path`, `aliases`, and optional `observed_paths`; when guidance aliases exist it also contains `guidance_path`. Every alias has `kind`, `path`, `shape`, and `target`. Skills aliases must target `canonical_path`; guidance aliases must target `guidance_path`. The checker reads the selected contract file and inspects only paths below the caller-supplied root, accepts only relative entry paths that do not traverse upward, never writes, executes no child process, and emits JSON. It classifies optional observed paths as `not-declared` when their entries exist, including dangling links, and do not duplicate a declared path.

Use an owned workspace and contract file that remain stable during inspection. The helper accepts a regular UTF-8 JSON file without symbolic or hard links, of at most 1 MiB; up to 256 declared aliases and 256 observed paths; relative paths and targets of at most 1,024 characters; and an absolute root of at most 4,096 characters. It rejects unknown fields, duplicate JSON keys, excessive nesting, and unsupported or changed contract files before interpreting them. An actual link escaping the root is reported as `wrong-target` without reading destination content; an undeclared link remains `not-declared`. These checks are not a sandbox against concurrent hostile mutation.

The helper deliberately supports only `symbolic-link` aliases. An unrecognized shape or a contract whose canonical path or expected target escapes the root is rejected rather than interpreted. Manual inspection remains the portable fallback when Node.js is unavailable.

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
