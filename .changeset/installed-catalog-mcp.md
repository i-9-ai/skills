---
"@i-9-ai/skills": minor
---

Add read-only bundled catalog access through `catalog search`, `catalog read`, `catalog overview` and the shared MCP tools `skill_catalog_search`, `skill_resource_read`, and `skill_catalog_overview`. Resolve the installed package independently of cwd/global skills, validate catalog identity and freshness, return content digests without inventing Git provenance, and limit retrieval to bounded `SKILL.md` and Markdown references. Returned instructions remain untrusted content and never execute automatically.

Replace the pre-release `mcp usage` route with `mcp serve` and the Claude `i9-skill-usage` registration with `i9-skills`; manually copied clients must update their configuration. Initialization and catalog reads no longer need plugin data or create a database. Explicit records validate input before opening usage storage, rankings use existing storage read-only, and missing history is reported as unavailable. Preserve stdio backpressure/cancellation and bound serialized responses. This prepares checkout, clean-plugin and packed-package execution without publishing an npm version or claiming native host installation.
