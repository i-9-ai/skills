---
name: skill-evidence-note
description: Use to organize supplied evidence for one skill review into a review-evidence note without judging quality.
license: Apache-2.0
metadata:
  source: original-synthetic-fixture
---

# Skill Evidence Note

Produce one review-evidence note for one identified skill. Accept a caller's
package reference, review request and artifact references. Do not evaluate the
skill, approve it, install it or collect private transcripts.

Record the supplied package identity, review question, available evidence,
missing evidence and next reviewer handoff. Open only references the caller
authorized. A missing reference is a gap, not a failed-quality verdict.

Use the bundled `references/checklist.md` when assembling the evidence sections.
Resolve it relative to this package and write the note to the caller's selected
workspace. The package needs no provider, global directory or executable helper.

Example: `skill-alpha`, a portability question and one package-tree artifact
produce a note containing that identity, the artifact reference and any missing
consumer-layout evidence. Report only what was actually inspected.
