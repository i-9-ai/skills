---
"@i-9.ai/skills": patch
---

Retain a bounded source receipt when a compiled package is prepared from a clean Git checkout of the collection. Installed `catalog search`, `catalog read`, `catalog overview` and their MCP equivalents expose the exact source revision as a build assertion after verifying distributed file digests. Missing, modified, archive or dirty-source receipts report unavailable Git provenance; receipt hashes do not authenticate the publisher, and runtime reads never infer a revision from the caller's repository.
