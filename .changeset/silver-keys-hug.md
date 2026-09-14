---
"i9-skills": minor
---

Add a local aggregate skill index that combines explicit `skills-catalog.json` manifests for cross-source lookup while preserving each repository manifest as canonical. The zero-dependency helper writes `skills-catalog.db` with Node.js built-in SQLite, retains source observations and normalized added, changed, and removed skill history across `sync`, and provides `history` and `changes` commands. Its deterministic `skills-catalog.index.json` fallback is current-state only. The helper rejects unsafe inputs and never changes source collections. This pre-release change also replaces the generic `catalog.json` manifest name across validation, session indexing, documentation, and authoring guidance without retaining an alias.
