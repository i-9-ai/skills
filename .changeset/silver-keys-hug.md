---
"@i-9.ai/skills": minor
---

Add a local aggregate skill index that combines explicit `skills-catalog.json` manifests for cross-source lookup while preserving each repository manifest as canonical. The zero-dependency helper writes `skills-catalog.db` with Node.js built-in SQLite, retains sync runs, source observations, and normalized added, changed, and removed skill history with timestamps and retention limits, and provides `history` and `changes` commands. Rebuild reset protection remains explicit. Its deterministic `skills-catalog.index.json` fallback is current-state only. The helper rejects unsafe inputs and never changes source collections. This first public catalog and aggregate-index contract uses format version `1`, contains no manual lifecycle-status field or unpublished draft compatibility, and replaces the generic `catalog.json` manifest name across validation, session indexing, documentation, and authoring guidance without retaining an alias.
