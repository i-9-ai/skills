# Skill MCP entrypoint

`skill_bump_report` returns a bounded evidence-based comparison;
`skill_onboarding` returns an inert versioned guide and complete synthetic examples.
Both are read-only and need no evidence database. See
[skill change reports](../../../docs/Skill%20Change%20Reports.md) for the matching
CLI commands, observation production, review inputs and classification limits.

Run `node bin/index.mjs mcp serve` with Node.js 24+ after explicit `npm ci` in a checkout, or use the prepared npm artifact. The root plugin starts the same service directly without CLI dependencies. Initialization and catalog search/read/overview need no data directory and create no state. Standard output contains MCP JSON-RPC only.

Explicit usage events share `~/.agents/skills-usage.db` by default. Select
`I9_AGENT_STATE_ROOT` for another shared state root, `I9_SKILLS_USAGE_DB` for a
specific evidence file, or `--db /absolute/local-data/skill-usage.db` for one CLI
invocation. Automatic host plugin-data variables do not change the default.
Input is validated before a record opens storage and applies migrations;
rankings open existing valid storage read-only. Missing storage is unavailable,
not empty history. Catalog reads never record usage or activation.

The same server accepts explicit lifecycle assertions and complete catalog
observations, and queries their cohort metrics, overlap, inactivity coverage and
history. See [lifecycle evidence](../../../docs/Lifecycle%20Evidence.md) for complete
schema-2 examples and measurement limits. Queries never migrate older storage;
only a valid explicit record can perform that upgrade. Submitted source identities
and outcomes remain caller assertions, not independently authenticated evidence.

See [the complete MCP contract](../../../docs/Skill%20MCP.md) for tools, limits, provenance, retries, examples and clean-package verification. `catalog search`, `catalog read` and `catalog overview` expose the same bundled read-only operations as JSON. They ignore the caller's cwd/global skill collection.

Stop the client process to close any opened SQLite connection. Removing the
command does not delete shared or explicitly selected evidence. If an explicit
override points into host-managed plugin storage, that host's uninstall policy
still applies; preserve the data deliberately before uninstalling. The former
`mcp usage` route was replaced before the first release; manually copied clients
need `mcp serve`.
