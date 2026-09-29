---
"@i-9-ai/skills": patch
---

Extract multi-collection lookup, SQLite synchronization history and the evidence-backed evolution ledger into the standalone `skills-catalog-index` package. `skills-catalog` now maintains only one collection's canonical inventory and hands off aggregate work explicitly.

The existing `catalog aggregate` CLI routes and index formats remain unchanged. The new package includes its own read-only catalog decoder, runnable source examples and storage/recovery guidance, and works without an installed sibling. JSON remains a current-lookup fallback without SQLite history. Complete the collection's instruction index with the aggregate, host-compatibility and snapshot package boundaries.
