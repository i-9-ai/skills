---
name: skill-note-transfer
description: Use to turn one supplied skill evidence note into a portable reviewer handoff without changing the reviewed package.
license: Apache-2.0
metadata:
  source: original-synthetic-fixture
---

# Skill Note Transfer

Produce one reviewer handoff from a supplied evidence note for one identified
skill. Preserve the source identity, review question, inspected artifacts,
missing evidence and next decision owner. Do not evaluate the skill or alter
the reviewed package.

Use `references/handoff.md` when preparing the handoff sections. Resolve this
resource relative to the loaded package; choose the output path in the caller's
authorized workspace. No external service, installed companion or setup is
required. Do not copy private transcripts or credentials into the output.

Example: an evidence note for `skill-alpha` contains a package-tree artifact
and lacks a consumer-layout check. Its handoff preserves that artifact, lists
the missing check and requests a portability review without claiming approval.
