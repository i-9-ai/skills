---
title: "Structural skills host compatibility"
issue: "https://github.com/i-9-ai/skills/issues/14"
---

# Structural skills host compatibility

## Objective

Add one portable skill that verifies a repository exposes its canonical skill collection and agent guidance through declared, repository-local host aliases and returns a compatibility report.

## Scope

Author `skills-host-compatibility` with the required collection package contract, a focused procedure, host-neutral synthetic examples, catalog synchronization, and regression coverage. The skill treats `.agents/skills` and `AGENTS.md` as input conventions rather than universal requirements: its caller supplies the canonical paths and declared aliases, each classified as a skill-discovery or guidance alias.

## Exclusions

Do not inspect or change a user's home directory, install skills, copy collections, add undocumented aliases, configure provider hooks, or claim provider-runtime behavior. Do not make a package's portable core depend on this repository's validation command.

## Authority boundaries

The caller authorizes any repository inspection. The skill reports structural defects and recommended remediation only. `skill-installation` owns approved host or user installation, `skill-migration` owns collection transitions, and `skills-audit` owns package-quality review.

## Implementation sequence

1. Freeze the verified discovery-alias contract and the skill-design brief.
2. Author a compact, agent-agnostic package that accepts a repository root, canonical collection path, and declared aliases and returns one bounded report.
3. Include required license, interface metadata, distinct safe icons, and synthetic report examples; synchronize the generated catalog.
4. Validate the package structurally and officially, then run repository checks and independent review on the resulting revision.

## Acceptance criteria

- The package distinguishes present, missing, broken, wrong-target, duplicate-copy, unsupported-shape, and undeclared alias states for both skill-discovery and guidance aliases.
- It never treats a host-looking directory as supported without an explicit declared contract.
- It separates structural compatibility from runtime provider testing and global installation state.
- It names a safe handoff for installation, migration, and content-quality work.
- The complete package and repository pass required validation.

## Validation

Run the package's synthetic examples, `npm run check`, `git diff --check`, `npm run changeset:status`, and the mandatory official validator for the new package on the exact candidate revision.

## Rollback

Revert the package, its catalog entry, and this delivery's release note together. Existing aliases and their repository validation remain unchanged.
