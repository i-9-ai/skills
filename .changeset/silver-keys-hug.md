---
"i9-skills": minor
---

Add a local aggregate skill index that combines explicit collection catalogs for cross-source lookup while preserving each repository catalog as the canonical source. The zero-dependency helper writes `skills-catalog.db` with Node.js built-in SQLite, falls back to `skills-catalog.index.json`, rejects unsafe inputs, and never changes source collections.
