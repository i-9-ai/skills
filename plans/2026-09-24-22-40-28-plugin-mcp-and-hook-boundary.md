# Plugin MCP and hook boundary

Issue: `i9-skills-mek`. Delivery: PR #2.

## Objective

Expose the existing observed-read MCP from the repository-root plugin with a
stable, writable default database path supplied by the host. Inventory the
plugin hook mappings without advertising a handler that cannot run in a clean
plugin installation. Reconcile fully implemented GitHub issues in the PR body.

## Scope and boundaries

- Keep `.agents/skills` as the sole canonical skill tree and the repository as
  the plugin root.
- Add a dependency-free Node 24 stdio entrypoint around the existing MCP service
  and a plugin-data configuration that chooses `skill-usage.db` under the host's
  persistent plugin data directory. An explicit `--db` remains available for the
  normal CLI. Never write into the plugin source or caller's project by default.
- Map the MCP through host-specific legacy plugin manifests where the format and
  plugin-root substitution are documented. Do not add a portable root manifest
  that would override the custom `.agents/skills` collection path.
- Provide host marketplace catalogs for Claude Code and Copilot alongside the
  existing Codex catalog, each selecting the repository root as the plugin.
- Audit Codex, Claude and Copilot hooks as a separate host-specific surface.
  Existing checkout-only handlers are not made plugin-active until they have a
  dependency-independent or explicitly prepared runtime and native host checks.
- Inspect GitHub issues against the actual PR diff. Use `Closes` only for complete
  acceptance; describe related partial scopes without closing them.

No plugin installation, marketplace registration, release, merge, visibility
change, database reset or automatic dependency installation is authorized here.

## Acceptance and verification

1. A synthetic plugin data directory launches the stdio MCP directly from the
   tracked source and responds to initialize and tool discovery without
   `node_modules` or a writable checkout.
2. Missing or invalid plugin data location fails before creating a database.
   Explicit CLI `--db` continues to work.
3. Manifest paths resolve inside the root plugin and differ by host only where
   the host format requires it. Marketplace entries resolve to that same root.
   Tests verify structure and default storage.
4. Documentation distinguishes MCP read evidence from activation, and maps
   existing project hooks versus plugin-bundled hooks with current limits.
5. `npm ci`, `npm run check`, `npm run package:check`, Changeset status, diff
   checks, host manifest validation where available and exact-head PR CI pass.

Removing the MCP references from host manifests disables the plugin connection
without touching the caller-owned database. The entrypoint can then be removed
without changing the existing CLI. GitHub issue references in the PR body are
independently reversible.
