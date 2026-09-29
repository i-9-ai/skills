---
name: skill-publication
description: Use to publish one approved skill package through an authorized distribution channel after exact-revision release gates have passed.
license: Apache-2.0
metadata:
  author: i-9-ai
  tags: "skills, publication, release"
  source: original
  source_url: "https://github.com/i-9-ai/skills"
  reasoning-effort: high
---

# Skill Publication

## Responsibility and inputs

Publish one approved skill package through one authorized distribution channel and return a publication receipt. Accept the exact candidate revision, channel, public metadata, license and provenance decisions, required approval, and current release-gate evidence.

## Procedure

1. Resolve the exact candidate bytes and distribution target. Reject working-tree ambiguity, floating source references, or mismatched evidence.
2. Verify required official, behavioral, security, compatibility, lifecycle, license, provenance, and public-content gates for that same revision.
3. Build or stage the channel-specific publication payload without importing scratch files, private examples, credentials, local paths, or unrelated packages.
4. For a non-Git destination, read [the distribution adapter reference](references/distribution-adapters.md). Use only a documented adapter that preserves the package bytes, license, and provenance; otherwise stop with an unsupported-channel result. Do not substitute the portable Git channel without explicit authorization for that destination.
5. Present the concrete payload and destination when an external publication approval is still required. Do not treat prior validation as publication authority.
6. Publish only through the authorized channel using its documented mechanism. Avoid mutable replacement when the channel supports immutable versions.
7. Read back the public artifact or channel record, compare its identity with the candidate, and record any indexing delay separately.
8. Return a receipt with package, revision, channel, public location, published digest, gate evidence, time, and rollback or deprecation path.

## Tools and authority

Use packaging, checksum, channel, and read-back tools authorized by the caller. Credentials must remain in the channel's secret store and never enter skill files, logs, receipts, or prompts. Publication authorization is specific to the named package, revision, and destination.

## Output and evaluation

The primary output is one publication receipt. Preparing a package belongs to authoring or evolution; lifecycle judgment belongs to lifecycle review; installing a public package belongs to installation.

Pass when the published artifact is independently readable, matches the approved bytes, exposes the intended license and metadata, and has an actionable rollback or deprecation path. If read-back is unavailable, report publication as unverified.
