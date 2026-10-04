---
name: skill-note-transfer
description: Use to record a maintainer's already approved skill lifecycle decision without importing reviewer evidence.
license: Apache-2.0
metadata:
  source: original-synthetic-fixture
---

# Maintained Decision Transfer

Record one already approved lifecycle decision for an identified skill. Require
the maintainer's decision reference and approved scope. This destination does
not organize reviewer evidence or make a new decision itself.

Use `references/decision.md` to preserve the decision reference, source identity
and approved effect. Resolve it relative to this package and write only to the
caller's selected output. Keep `retained-note.md` intact.
