# Plugin MCP and hook boundary

Issue: `i9-skills-mek`. Baseline: PR #2. Installed-hook completion: #20.

The separate [installed catalog MCP plan](2026-09-29-19-09-50-installed-catalog-mcp.md)
extends the initial usage-only server described below. Catalog initialization is
now independent of data storage; current operator behavior is documented in the
[MCP guide](../docs/Skill%20MCP.md). Hook acceptance remains owned by this baseline.

## Objective

Expose the existing observed-read MCP from the Claude repository-root plugin
with a stable, writable default database path supplied by the host. Inventory the
plugin hook mappings without advertising a handler that cannot run in a clean
plugin installation. Reconcile fully implemented GitHub issues in the PR body.

## Scope and boundaries

- Keep `.agents/skills` as the sole canonical skill tree and the repository as
  the plugin root.
- Add a dependency-free Node 24 stdio entrypoint around the existing MCP service
  and a plugin-data configuration that chooses `skill-usage.db` under the host's
  persistent plugin data directory. An explicit `--db` remains available for the
  normal CLI. Never write into the plugin source or caller's project by default.
- Map the MCP only through a host legacy plugin manifest where plugin-root
  substitution and persistent plugin data are documented. Codex and Copilot
  retain skills-only manifests until their legacy MCP runtime path is verified.
  Do not add a portable root manifest that would override the custom
  `.agents/skills` collection path.
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
   Only the Claude manifest advertises the tested MCP entrypoint. Tests verify
   structure and default storage.
4. Documentation distinguishes MCP read evidence from activation, and maps
   existing project hooks versus plugin-bundled hooks with current limits.
5. `npm ci`, `npm run check`, `npm run package:check`, Changeset status, diff
   checks, host manifest validation where available and exact-head PR CI pass.

Removing the MCP reference from the Claude manifest disables the plugin connection
without touching the caller-owned database. The entrypoint can then be removed
without changing the existing CLI. GitHub issue references in the PR body are
independently reversible.

## Installed-hook completion (#20)

The inaugural plugin boundary now includes the previously deferred installed
runtime. Keep the baseline above as provenance; this section supplies the
implementation and acceptance for the separately reviewed hook delivery.

### Outcome and scope

An installed repository-root plugin provides bounded available-skill context
without Git, node_modules, build output or a globally installed CLI. Node 24 runs
the erasable TypeScript transport directly. Codex and Claude select their native
configuration files while sharing discovery, rendering and telemetry services.
No dependencies are added. The canonical skills remain in `.agents/skills`.

- Add `PluginHookRunner` as the narrow installed-plugin transport. Read bounded
  strict JSON once, validate the explicit host and event cwd, and keep diagnostics
  on stderr. Missing runtime prerequisites never initiate installation.
- Inject metadata parsing into the existing discovery repository rather than
  duplicate traversal. CLI consumers retain full YAML parsing. The installed
  runtime uses the existing package-owned frontmatter parser; unsupported foreign
  YAML produces an explicit bounded coverage warning. Resolve bundled resources
  from the installed module and caller resources from the event cwd.
- Discover plugin, project and global `.agents/skills` collections with real-path
  deduplication and truthful source labels. Render metadata as untrusted discovery
  hints, never as executable instructions or proof of host activation.
- Map verified SessionStart events for Codex and Claude. Preserve the status
  message `Loading available skills overview`. Register Claude native Read
  attempts and successful reads with the existing stable correlation and
  first-receipt deduplication. Codex tool-read identity remains unproved; do not
  infer reads from successful shell commands or invent a Read matcher.
- Use the selected host's persistent plugin data directory. Validate and, when
  needed, initialize only that directory outside both plugin and consumer roots;
  reject unsafe paths and preserve existing contents. No cwd/home fallback for
  storage. Unavailable state must not prevent session context. Never store raw
  tool results, prompts or documents.
- Add explicit `hooks/codex.json` and `hooks/claude.json` manifest references only
  after runtime fixtures pass. Avoid the automatically merged `hooks/hooks.json`.
  Keep Copilot and other hosts at their existing proven boundary.

### Verified host inputs

The source baseline is Codex 0.159.0 at
`687a119f0fcaace47e1f1abcc77cec6c813fd6da` and Claude Code 2.1.277, reviewed on
2026-09-29. Codex legacy plugin discovery provides `PLUGIN_ROOT` and `PLUGIN_DATA`;
Claude provides `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PLUGIN_DATA`. Codex uses a quoted
POSIX command with shell environment expansion. Claude supports executable plus
argument-array form. Do not advertise untested Windows or remote-executor hooks.

Primary references:

- [Codex legacy manifest loader](https://github.com/openai/codex/blob/687a119f0fcaace47e1f1abcc77cec6c813fd6da/codex-rs/core-plugins/src/loader.rs): explicit hook paths and legacy format.
- [Codex hook discovery](https://github.com/openai/codex/blob/687a119f0fcaace47e1f1abcc77cec6c813fd6da/codex-rs/hooks/src/engine/discovery.rs): root/data variables, substitution and trust.
- [Codex hook tool names](https://github.com/openai/codex/blob/687a119f0fcaace47e1f1abcc77cec6c813fd6da/codex-rs/core/src/tools/hook_names.rs): supported aliases and read-identity limit.
- [Claude hooks](https://code.claude.com/docs/en/hooks): event envelopes, successful native Read, executable arguments and neutral failure behavior.
- [Claude plugin reference](https://code.claude.com/docs/en/plugins-reference): explicit hook files and persistent plugin data.

### Sequence, validation and rollback

1. Introduce the shared parser seam and dependency-free service/transport.
2. Exercise clean plugin copies from a different cwd, with no Git, dependencies
   or build output. Use disposable HOME/data fixtures and roots containing spaces
   and shell metacharacters. Test canonical and unsupported metadata, real-path
   duplicates, bounded output and invalid input without permission decisions.
3. Prove Claude attempt/success separation, missing-response rejection,
   unsupported-event neutrality and duplicate idempotence. Prove no Codex read
   claim. Check absent, relative, unwritable and linked state locations without
   writes into plugin or project; session context must remain available.
4. Register the tested host files and update operator guidance, contracts and
   Changeset. Run Node 24 `npm run check`, package checks, Changesets status and
   whitespace validation. Obtain exact-commit independent review and matching-head
   GitHub checks before delivery.
5. Record native host installation, trust and actual hook execution separately in
   #12. Source inspection and direct transport tests do not establish those facts.

The user authorizes implementation, focused PRs and merges after the required
review gates. This delivery does not change host-global configuration, trust,
repository visibility or marketplace state, and does not publish a release.
Removing the two manifest hook references disables hooks without deleting stored
metrics. The shared CLI and existing MCP remain usable. Remove newly unreferenced
runtime/configuration files only after checking their consumers.
