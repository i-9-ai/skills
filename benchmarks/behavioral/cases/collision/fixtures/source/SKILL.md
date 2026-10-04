---
name: skill-note-transfer
description: Use to prepare a reviewer handoff from a supplied skill evidence note without making a lifecycle decision.
license: Apache-2.0
metadata:
  source: original-synthetic-fixture
---

# Skill Note Transfer

Prepare one reviewer handoff for one identified skill. Preserve supplied source
identity, artifact references and gaps. Do not decide lifecycle status or record
an approval that the maintainer did not supply.

Use `references/handoff.md` when organizing the handoff. Resolve it relative to
this package and write to the caller's selected workspace. No executable helper
or provider-specific setup is required.
