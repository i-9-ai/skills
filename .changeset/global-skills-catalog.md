---
"@i-9.ai/skills": patch
---

Make `skills-catalog` standalone and add an explicit global layout for `<root>/skills`. Global synchronization supports confined canonical-package links, nested real packages, fixed root output, atomic replacement, and byte-idempotent verification while excluding `.system`. Establish the first public catalog schema as version `1`, containing package identity and routing metadata without a manual lifecycle-status field or compatibility for unpublished drafts.
