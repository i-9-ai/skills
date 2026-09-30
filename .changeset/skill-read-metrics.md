---
"@i-9.ai/skills": minor
---

Add explicit `skill_read_record` and bounded `skill_read_rankings` tools to the local `mcp serve` interface, with idempotent native SQLite read evidence, checked migrations, and distinct-session period counts. Usage operations require a dedicated caller-owned database; read-only bundled catalog operations do not. The MCP installs no hooks and does not infer activation or publish an npm package.
