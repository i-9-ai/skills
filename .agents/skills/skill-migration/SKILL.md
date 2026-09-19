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
4. Adapt only target-specific packaging and references. Preserve behavior unless a separately approved evolution record authorizes change.
5. Validate the target candidate with official, behavioral, security, provenance, host, and collection checks.
6. Apply the authorized target change, verify it in place, then perform only the authorized source-side deprecation or removal.
7. Return a migration record mapping old and new identities, exact revisions, changed adapters, consumer actions, validation evidence, and rollback steps.

## Tools and authority

Use source and target read/write tools only within explicitly authorized repositories. Access to one collection does not grant access to another. Migration does not authorize publication, global installation, destructive history rewriting, or deleting the source package.

## Output and evaluation

The primary output is one migrated target package plus its migration record as a single reviewable change set. Pass when provenance and license survive, responsibility remains clear, consumers have an explicit transition path, both collection catalogs can be reconciled, and rollback is possible.
