---
"@i-9-ai/skills": minor
---

Make the repository root a Codex, Claude Code and Copilot plugin with host manifests referencing the single canonical `.agents/skills` collection and a root marketplace entry for each host. Map the existing observed-read MCP into Claude Code through a dependency-free Node 24 entrypoint and persist its dedicated SQLite database in host-provided plugin data; missing data paths fail closed. Codex and Copilot remain skills-only until their legacy MCP data-path behavior is verified. Project hook adapters remain separate until an installed-plugin handler is independently runnable. Keep `plugin prepare` as optional disposable staging rather than tracking a copied collection. Guard Wiki synchronization against a disabled Wiki and exclude `AGENTS.md` from mirrored pages, including stale copies.
