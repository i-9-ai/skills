---
"@i-9.ai/skills": minor
---

Add a Copilot CLI legacy-plugin MCP mapping through `.github/plugin/plugin.json`
and `mcp/copilot.json`, launching the existing Node 24 TypeScript server with
`--host copilot` and retaining the canonical skill collection. Catalog, resource,
overview, bump-report and onboarding tools need no evidence database. Explicit
evidence operations use only caller-supplied absolute `COPILOT_PLUGIN_DATA`;
missing or invalid storage fails closed without a home or other-host fallback.

Document isolated Copilot 1.0.89 native discovery and direct tool execution,
synthetic record retry behavior and data-preserving removal of an ephemeral
plugin mount. Legacy data is not automatically provisioned, and the operator must
keep it outside the unknown consumer directory as well as the plugin. Other
client versions retain the portable `mcp serve --db` fallback; this does not claim
model behavior, persistent marketplace installation or publication.
