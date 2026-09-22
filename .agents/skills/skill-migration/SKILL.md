---
name: skill-migration
description: Use to migrate one skill package between collections while preserving behavior, provenance, history, compatibility, and an auditable handoff.
license: Apache-2.0
metadata:
  author: i-9-ai
  tags: "skills, migration, portability"
  source: original
  source_url: "https://github.com/i-9-ai/skills"
  reasoning-effort: high
---

# Skill Migration

## Responsibility and inputs

Migrate one skill package from a source collection to a target collection and return an auditable migration record. Accept the exact source revision, target collection contract, naming decision, provenance, license, consumers, compatibility requirements, and cutover authority.

## Procedure

1. Establish the source package bytes, responsibility, provenance, license, catalog identity, any separately recorded lifecycle evidence, consumers, host metadata, and validation baseline.
2. Assess target naming, path, policy, catalog, runtime, and dependency compatibility. Resolve collisions before copying any bytes.
3. Define a cutover plan covering target addition, consumer transition, source deprecation or retention, rollback, and ownership. Avoid a period where two mutable packages claim the same canonical identity.
   Record the history strategy before copying: retain the original repository and reachable commit references, preserve an independently verified Git bundle outside the installed package, or transfer the relevant history through an explicitly authorized import. A source/target revision table alone does not preserve history. For a bundle, use `git bundle create <archive.bundle> <source-ref>` and `git bundle verify <archive.bundle>` in an authorized source checkout, then verify the recorded source commit is reachable from the bundle in a disposable clone. Bundle only authorized history; never include private unrelated commits in a public artifact. If history cannot be retained or transferred, return a blocked migration with the missing owner decision.
4. Adapt only target-specific packaging and references. Preserve behavior unless a separately approved evolution record authorizes change.
5. Validate the target candidate with official, behavioral, security, provenance, host, and collection checks.
6. Apply the authorized target change, verify it in place, then perform only the authorized source-side deprecation or removal.
7. Return a migration record mapping old and new identities, exact revisions, changed adapters, consumer actions, validation evidence, and rollback steps. Include the retained repository/ref or archive identity and digest, the source commit, and the history verification result and retention owner.

## Tools and authority

Use source and target read/write tools only within explicitly authorized repositories. Access to one collection does not grant access to another. Migration does not authorize publication, global installation, destructive history rewriting, or deleting the source package.

## Output and evaluation

The primary output is one migrated target package plus its migration record as a single reviewable change set. Pass when provenance and license survive, the source history remains verifiably retrievable through the recorded strategy, responsibility remains clear, consumers have an explicit transition path, both collection catalogs can be reconciled, and rollback is possible.
