# Isolated native plugin installation pilot

Issue: #12. Prerequisites: installed hooks (#20) and installed catalog MCP (#21).

## Outcome

Exercise this repository-root plugin through the installed Codex and Claude Code
clients. Record native discovery, trust, session hooks, MCP loading, a local source
update and rollback. Keep `.agents/skills` as the only canonical collection. Direct
transport fixtures and manifest parsing remain separate from native host evidence.

## Scope and authority

The user authorized first local plugin tests and continued implementation. This
pilot installs and registers only in new disposable host profiles and a synthetic
consumer directory. It must not read or modify the real user's host configuration,
credentials, installed skills, marketplace entries, projects or stored telemetry.
Do not authenticate, invoke a real model, start a user conversation, publish,
release, change repository visibility or submit to a public marketplace. The
bounded synthetic Codex turn described below uses only an isolated local stub.

Use verified installed binaries and Node 24. Capture their versions and help.
Pin a disposable source clone to each exact Git commit. Do not use a shared Git
worktree or a second editable canonical skill tree. Do not inherit credentials or
initiate dependency downloads. Local source loading is deliberate: hosted Git fetch
and version-cache updates are a separate test boundary.

## Isolation and execution

1. Clone this local repository into a temporary source directory with
   `--no-local --no-hardlinks --no-checkout`, then detach at the selected commit.
   Use a different empty consumer directory. Retain one temporary evidence root.
2. Construct each subprocess environment explicitly. Set fresh HOME, CODEX_HOME,
   CLAUDE_CONFIG_DIR, CLAUDE_SECURESTORAGE_CONFIG_DIR, ANTHROPIC_CONFIG_DIR, XDG
   directories and TMPDIR. Disable automatic updates, analytics and curated
   marketplace installation. Use file credential stores in the disposable Codex
   configuration; never run login/logout or copy real credentials. Require both
   hosts to report no authentication before installation.
3. On the tested macOS host, use an OS sandbox that denies network and confines
   writes to the temporary root. Preflight both an allowed fixture write and a
   denied write outside that root. Environment selection alone is not a sandbox.
   A sandbox or credential-isolation failure stops native execution with evidence.
4. Register the local root marketplace and install `i9-skills@i9-skills` using each
   client's actual plugin commands. Capture native inventory, enabled state,
   manifest version, loaded paths and file digests. Assert the canonical package
   count against that exact source, excluding host-bundled system skills.
5. For Codex, query `skills/list` and `hooks/list` through its installed app-server.
   Review the exact plugin hook key, source, command and hash. Trust only that hash
   through the native configuration RPC used by the TUI, inside the disposable
   profile. Start an ephemeral read-only thread and inspect native lifecycle
   behavior. On the verified version, SessionStart waits for its first turn;
   use only the isolated local-stub lane below to establish execution. Never
   bypass hook trust or send a real model request.
6. For Claude, use its supported initialization-only path and plugin inventory.
   Inspect native hook diagnostics and host-owned telemetry for one session-start
   envelope without inferred skill reads. Check native MCP health and its resolved
   command/path. Use the server name in the selected revision's manifest. Do not
   use options that suppress hooks or exclude plugin MCP servers.
7. Stop all children, switch the disposable source from A to B, and refresh each
   host's observed installed source/cache through its supported native commands.
   Do not assume that a local marketplace means in-place loading. Repeat discovery,
   trust and runtime observations. Then restore A and prove loaded-byte rollback
   and preserved evidence storage. Use the reviewed #20 commit as A and reviewed
   #21 commit as B; record full SHAs in the final evidence.
8. Remove only these disposable plugin and marketplace registrations. Request
   Claude's documented data-preservation option. Verify absence from inventories
   and preservation of evidence. Keep the temporary results for inspection; no
   real-profile uninstall or cleanup is involved.

Ephemeral orchestration may live in the evidence directory. Document reproducible
commands and measured outcomes in the public guide; do not add native clients,
network or installation to `npm test` or the ordinary CI suite.

## Evidence and acceptance

Record host/runtime versions, source commits, source and loaded file hashes,
isolated path roles, manifest validation, native inventory, trust state, hook
completion, MCP health and update/rollback/unregister results. Redact machine-local
absolute paths and retain no prompts, credentials or personal records in tracked
evidence. Confirm source and consumer bytes are unchanged and all state belongs
to the disposable host directories.

Do not convert an unexecuted check into a compatibility claim. In particular:

- Local source A/B/A proves source-pin replacement, not hosted version updates.
- Noninteractive Claude initialization does not prove its interactive trust UI.
- A SessionStart envelope does not prove native Read-tool telemetry.
- An advertised but unverified Codex/Copilot MCP mapping remains absent.
- An environment/runtime failure is a recorded limitation, not a passed pilot.

If a native mismatch requires a repository fix, add meaningful isolated regression
coverage, a Changeset and exact-commit review. Repeat the affected native check on
the fixed commit. Run ordinary Node 24 checks and packed verification separately
before a focused PR. No new dependency is planned.

## Rollback

Terminate the foreground native children, restore the selected source commit and
remove only the isolated registrations. Preserve their host-owned data and logs.
No rollback action touches the user's real environment. A documentation-only
pilot report can be reverted independently from the plugin runtime.

## Primary references

- [Codex plugin hook trust RPC](https://github.com/openai/codex/blob/687a119f0fcaace47e1f1abcc77cec6c813fd6da/codex-rs/tui/src/hooks_rpc.rs).
- [Codex marketplace source parsing](https://github.com/openai/codex/blob/687a119f0fcaace47e1f1abcc77cec6c813fd6da/codex-rs/core-plugins/src/marketplace_add/source.rs).
- [Claude authentication](https://code.claude.com/docs/en/authentication),
  [plugin loading](https://code.claude.com/docs/en/plugins/loading), and
  [CLI reference](https://code.claude.com/docs/en/cli-reference).

The implementation intake verified Codex 0.159.0, Claude Code 2.1.277 and Node
24.21.0 on 2026-09-29. Recheck the installed interfaces before execution.

## Observed Claude dependency preparation

The first native attempt showed that Claude 2.1.277 reports a copied installation
path and runs `npm ci --ignore-scripts` when the plugin root has a lockfile. Later
native diagnostics confirmed that runtime loading resolves this local marketplace
to its source in place; a reported cache path alone does not prove loaded bytes.
Its warning timeout is sixty seconds; the pilot's initial forty-five-second timeout
interrupted registration before completion. This is not evidence of a plugin
runtime failure.

Permit this native dependency attempt with `npm_config_offline=true` and a new,
empty cache inside the disposable root. The OS network denial stays active,
dependency scripts remain disabled, and missing packages must fail promptly.
Record Claude's warning and verify whether registration completes. Then test the
plugin's dependency-free hook/MCP runtime separately. This lane cannot establish
a successful online dependency installation; normal hosted installation and its
network preparation remain separate evidence. Never read the user's npm cache or
claim that the host installer performed no setup merely because the runtime needs
none.

## Codex first-turn dispatch with a local response stub

Pinned Codex source at `687a119f0fcaace47e1f1abcc77cec6c813fd6da` shows that
thread creation queues SessionStart and run_turn dispatches it with a TurnContext.
Two no-turn attempts produced no hook event. Preserve that evidence and distinguish
the scheduling rule from a plugin defect.

For native dispatch only, configure a dedicated custom provider with a base URL
at one owned `127.0.0.1` port, Responses wire protocol, authentication disabled,
websockets disabled, zero request/stream retries and a five-second idle limit.
Never configure an API key, credential environment variable, bearer token or
authorization header. Use an explicitly synthetic model identifier and prompt.

A Node built-in HTTP fixture supplies fixed response.created,
response.output_item.done and response.completed SSE events with zero usage.
Allow the native subprocess outbound access only to that exact loopback port;
its OS sandbox continues to deny external network and writes outside the pilot.
Run the fixture under a separate profile permitting bind/inbound only on that
port and no external outbound access. Before execution, verify exact-port success,
adjacent-port denial, TEST-NET destination denial and outside-write denial.

Bound request count, body bytes and total time. Reject unexpected methods/paths,
authorization headers and tool-call events. Perform one synthetic turn at each
explicit A/B/A source pin, observe native hook completion and assert its context
is present in the fixture's captured request. Retain hashes and sanitized outcome
data, not prompt contents, in tracked evidence. Stop owned clients and listener
afterward. Claude keeps its original full network denial.

This establishes native hook delivery against a stubbed model transport, never
real model behavior, provider connectivity, authentication or task quality. The
public report must state this distinction and preserve the failed no-turn lane.

## Native Codex MCP mapping

Complete the remaining Codex MCP acceptance through the existing legacy plugin
manifest, preserving its explicit `.agents/skills` collection and installed
Node 24 entrypoint. Before selecting configuration fields, inspect their handling
in the pinned Codex source and the installed app-server protocol. In particular,
prove how the legacy loader resolves `cwd` and relative command arguments, and
whether explicitly listed environment variables reach the MCP child. Hook-only
environment injection is not evidence for MCP behavior.

The candidate adapter is a file-backed `mcpServers` mapping with `command: node`,
`cwd: .`, the relative `src/transport/PluginMcpServer.ts --host codex` arguments,
and `env_vars: [PLUGIN_DATA]`. Its capability boundary must be explicit: catalog
queries need no storage; usage operations require a caller-supplied absolute data
directory outside both plugin and consumer. Do not invent a home fallback, copy
hook environment assumptions, add automatic setup, or change collection layout.
Keep an unsupported field or mapping absent if native execution cannot prove it.

The legacy MCP process uses the installed plugin as its working directory. It
cannot infer the consuming thread's directory from that value. Therefore the
operator must select data outside the consumer as well as outside the plugin;
do not claim that this adapter independently enforces the unknown consumer path.

Use a new disposable source fixture and Codex profile, never reuse the retained
A/B/A proof directories. Capture the exact source commit plus any candidate file
overlay hashes; once the change has a reviewed commit, repeat the affected native
checks against that commit. Keep the full network denial and outside-write denial
from the original preflight. No model response stub is needed if the native
app-server permits direct tool calls on an ephemeral thread; otherwise record the
missing capability before changing this plan. Authentication must remain absent.

Through native marketplace/plugin registration and app-server RPC, verify:

1. The installed manifest and MCP mapping hashes match the candidate source, and
   native status/tool discovery identifies the expected plugin server.
2. A catalog query returns the bundled canonical packages without creating an
   evidence database. With no `PLUGIN_DATA`, an explicit usage write returns
   `storage_unavailable` and creates no fallback database.
3. With an explicit isolated `PLUGIN_DATA`, one synthetic read can be written and
   queried through native MCP. Verify database location and schema, and preserve
   those bytes across native plugin/marketplace removal.
4. Plugin source/cache and consumer snapshots remain unchanged by MCP calls;
   stopped process groups and empty native inventories establish cleanup.

Add meaningful offline regression coverage for the mapping and its data boundary,
but keep native host execution outside the ordinary test suite. Record pinned
source references, host/runtime versions, request/result shapes and sanitized
observations in the pilot evidence. Root documentation and the Changeset must
distinguish native discovery/direct tool execution from model use and automatic
data provisioning. Removing this optional mapping rolls back Codex MCP discovery
without removing preserved data or changing canonical skills and hooks.
