# Copilot legacy plugin MCP mapping

## Objective and boundary

Complete the Copilot CLI legacy-plugin MCP portion of
[issue #12](https://github.com/i-9-ai/skills/issues/12) through the existing
TypeScript runtime. This is a separate host boundary with its own removable
mapping. Preserve the manifest's canonical `.agents/skills` path, the Codex and
Claude contracts, and the current MCP tools and protocol. A native planning-mode
control is unavailable in this session; this plan is the implementation gate.

Scope is one Copilot MCP configuration, the closed runtime host selector and data
configuration when supported, focused synthetic tests, and host-specific
documentation and release intent. No duplicated skill payload, alternate runtime,
new dependency, hook integration, migration to Agent Plugins, or general host
framework is included. Shared documentation and indexes are integrated by the
coordinating maintainer.

## Source and implementation sequence

1. Review the official legacy manifest and MCP documentation at
   [`github/docs` revision `339429df5ad02314aa9976e27dde0c17b3b910f6`](https://github.com/github/docs/tree/339429df5ad02314aa9976e27dde0c17b3b910f6/content/copilot).
   The legacy `mcpServers` field accepts a separate JSON file; the documented
   automatic `PLUGIN_DATA` directory belongs to Agent Plugins. Do not transfer
   Agent Plugins or hook semantics to the legacy MCP adapter.
2. Inspect the official Copilot CLI 1.0.89 distribution without installation.
   Its public repository at
   [`8dfa6009c4a04b3a22a5ca4a7c36a056edd718dd`](https://github.com/github/copilot-cli/tree/8dfa6009c4a04b3a22a5ca4a7c36a056edd718dd)
   contains documentation and release information, not the loader source. Record
   package integrity, executable hash, actual host output and source limitations.
3. Before native execution, construct a fresh profile, consumer and plugin fixture
   with no inherited credentials. Prove operating-system denial of network access
   and writes outside the fixture. Deny reads of the real user profile, except the
   explicitly selected Node 24 runtime. Run help/version and only supported local
   plugin/MCP inspection or direct tool RPCs, without model turns or authentication.
4. Establish the legacy mapping's path resolution, environment handling and data
   availability through that isolated native observation. Implement only observed
   fields, launching `src/transport/PluginMcpServer.ts --host copilot` with Node 24.
   If persistent data cannot be configured reliably, keep catalog/report/guide
   access and document the explicit portable CLI fallback for evidence storage.
   Never invent home storage, consumer-directory discovery or automatic data
   provisioning. Any optional storage must remain explicit, absolute and external
   to the plugin and consumer; state the limitation if the consumer is unknown.
5. Add the smallest closed host-configuration change and meaningful offline tests.
   Keep ordinary tests independent of the native CLI and network. Document native
   discovery, direct runtime checks and any unavailable end-to-end capability as
   separate evidence levels. Record the exact source revision and candidate file
   hashes for any native fixture; a later committed check must name its exact SHA.

## Validation and acceptance

The isolated native probe selected the file-backed mapping with
`${PLUGIN_ROOT}/src/transport/PluginMcpServer.ts`, `--host copilot`,
`env.COPILOT_PLUGIN_DATA: ${COPILOT_PLUGIN_DATA}` and `tools: ["*"]`. The runtime
selects only that host-specific data variable. The legacy loader expands a
supplied value and leaves the missing placeholder literal; the existing absolute
path guard therefore preserves catalog-only operation without storage. It starts
the child in the plugin root and supplies no consumer directory. Native evidence
is scoped to Copilot 1.0.89 and an ephemeral `--plugin-dir` mount, with direct
tool RPC calls and no model turn. See the
[Copilot MCP pilot](../docs/Copilot%20MCP%20Pilot.md) for the actual source identity,
checks, permission handling and limits.

- Verify the root manifest points at the new MCP mapping and retains the same
  canonical skills path. Verify launch from an installed path containing spaces.
- Exercise initialize/tool discovery and read-only catalog operations with no
  data. No home, consumer or installed files may change, and no database is
  created. An explicit evidence write without configured storage fails closed.
- If explicit data is supported, exercise one synthetic write, idempotent retry,
  read query, rejection of relative/plugin/symlink destinations, and preservation
  of the database after removing only the disposable plugin configuration.
- Verify Copilot selection cannot fall back to another host's data variable and
  unsupported host selectors remain rejected. Repeat the existing Codex and
  Claude affected suites using Node 24.
- Run focused `node --test` suites and pinned local formatting checks. The
  coordinator runs `npm run check`, `npm run changeset:status`, package checks and
  `git diff --check` after integration; obtain independent exact-commit review.
- Retain sanitized source references, package hashes, sandbox preflight,
  constructed-environment details, native requests/results and cleanup evidence
  outside the repository. Tracked documentation contains no host paths, raw
  provider logs, credentials or copied proprietary loader payload.

## Authority and rollback

Local repository implementation and disposable native probes are authorized.
This does not authorize real-profile installation, authentication, provider
requests, remote mutation, releases, visibility changes or publication. The
coordinator owns Git, issue/task tracking, shared indexes and full builds.

If native checks cannot run within these boundaries, record the exact missing
capability and retain the portable CLI fallback. Removing the optional Copilot
manifest reference, mapping and selector support rolls back this integration;
never remove preserved external evidence data or alter canonical skill packages.
