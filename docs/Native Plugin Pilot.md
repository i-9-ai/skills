# Native plugin pilot

The isolated pilot on 2026-09-29 passed native registration, 24-skill discovery,
SessionStart execution, local source replacement and rollback in Codex and Claude
Code. Claude's MCP initialization also passed. No repository runtime defect was
found in this scope. This is evidence for the versions and source commits below,
not a claim about every host, model or later revision. The subsequent
[Codex MCP pilot](https://github.com/i-9-ai/skills/wiki/Codex-MCP-Pilot) adds native tool discovery and explicit
catalog/read-evidence calls; the historical A/B/A results below remain unchanged.

## Candidate and environment

| Item | Observed value |
| --- | --- |
| Codex | `0.159.0` |
| Claude Code | `2.1.277` |
| Node | `24.21.0` |
| Source A | `a2f28f6ab2f9c64b30cc5751fee32a4b1d496dde` |
| Source B | `663f95c82a9aa0c7809ac2fce585b3e839a7961e` |
| Rollback source | Exact A |
| Manifest version at both pins | `0.1.0-rc.1` |
| Canonical inventory | 24 packages in `.agents/skills` |

The source was a disposable local clone made with `--no-local --no-hardlinks
--no-checkout`. A separate empty directory represented the consumer. Explicit
environment variables selected fresh host, credential-store, cache and temporary
directories. Both clients reported no authentication before and after the run.
No real profile, installed user skill, consumer project or credential was changed.

An OS sandbox denied external network and writes outside the disposable root.
Preflight confirmed an allowed write and denied outside write/network access.
Codex's synthetic-turn lane added one owned loopback port only: its fixed-response
server could accept that port but could not make outbound requests. Preflight
confirmed access to that endpoint and denied another owned port and an external
TEST-NET destination. Environment variables alone were not treated as isolation.

## Native results

| Check | Codex | Claude Code |
| --- | --- | --- |
| Native marketplace and plugin registration | Enabled `i9-skills@i9-skills` | Enabled `i9-skills@i9-skills`; dependency-preparation qualification below |
| Discovery at A, B and restored A | 24 enabled plugin skills each time; bundled system skills excluded | 24 loaded skills each time |
| Hook trust and enablement | Reviewed command and exact hash accepted through native `config/batchWrite` | Initialization accepted the enabled plugin hook; interactive trust UI not exercised |
| SessionStart execution | Three native `hook/completed` events; 3,954 context characters each | Three initialization runs; 3,955 context characters each, including trailing newline |
| MCP initialization | No mapping tested | Connected at all three pins, including the new catalog server at B |
| Source replacement and rollback | Refreshed copied cache; loaded bytes matched selected pin | Local source loaded in place; loaded bytes matched selected pin |
| Unregister | Plugin and marketplace inventories empty | Inventories empty; uninstall explicitly preserved data |

Codex queues SessionStart when the thread starts and executes it during the first
turn in this tested version. Two initial thread-only attempts produced no hook
execution; the OS denied attempted websocket prewarming. The successful lane used
one synthetic turn at each pin through a local canned Responses endpoint, with
authentication and websockets disabled. Each request contained the hook's skill
overview. Exactly three requests reached the fixture; none had authorization,
cookie or API-key headers or tool-call items. This proves native context delivery,
not model behavior, provider connectivity, authentication or billing.

Claude used `--init-only`; no model request was needed. Native `mcp list` and
`mcp get` resolved these mappings:

| Source | Server ID | Entrypoint |
| --- | --- | --- |
| A and restored A | `plugin:i9-skills:i9-skill-usage` | `src/transport/PluginUsageMcpServer.ts` |
| B | `plugin:i9-skills:i9-skills` | `src/transport/PluginMcpServer.ts --host claude` |

At B, the native diagnostics recorded successful stdio initialization, tools
capability and negotiated protocol `2025-11-25`. Health checks did not invoke
catalog or usage tools. `plugin details` reported zero MCP servers despite the
successful file-backed mapping; health and resolved-command evidence support the
initialization claim.

Both pins use the same manifest version. Claude reported `up_to_date` but loaded
the changed local source on the next initialization; Codex refreshed its copied
cache through `plugin add`. This A → B → A test proves local source-pin replacement.
It does not prove hosted Git refresh, version-cache upgrades or automatic updates.

## Dependency preparation and recovery

Claude 2.1.277 attempts `npm ci --ignore-scripts` when the root plugin has a
lockfile. The harness initially interrupted that attempt at 45 seconds, before
the host's 60-second warning timeout. A fresh installation with offline npm mode,
an empty isolated cache and distinct empty user/global npm configuration files
exited zero, registered the plugin and warned `ENOTCACHED`. No dependency download
or lifecycle script execution succeeded. The hook and MCP entrypoints ran without
those dependencies; successful online dependency preparation remains untested.

One intermediate retry used the same user/global npm configuration file and
produced a double-loading warning. It was corrected before the fresh-install
result above. `TMPDIR` alone also did not relocate every Claude temporary file;
setting `CLAUDE_CODE_TMPDIR` inside the disposable root enabled initialization.
The denied attempts were retained as diagnostics rather than counted as passes.

The final Claude data store contained three `session.started` events and zero
`usage_reads`. Earlier events survived both source changes and `--keep-data`
uninstall. Its bytes before and after cleanup had the same SHA-256:
`04a343b71451f89b46a9f2b28126519875e0bbeaa67345b5d7961496f17d66ea`.
Codex's context-only hooks did not add read evidence. Source returned cleanly to
A, the synthetic consumer remained unchanged, and no owned process remained.

## Repeat the bounded pilot

Follow the [isolated pilot plan](https://github.com/i-9-ai/skills/blob/main/plans/2026-09-29-19-38-34-native-plugin-pilot.md)
before running native clients. Use a fresh disposable root, explicit environment
and OS sandbox for every subprocess. Do not paste these commands into a shell
using an ordinary user profile. Replace the bracketed arguments with locations
and revisions selected by that harness:

```text
codex plugin marketplace add <absolute-source> --json
codex plugin add i9-skills@i9-skills --json
codex plugin list --marketplace i9-skills --json

claude plugin validate <absolute-source> --json
claude plugin marketplace add <absolute-source> --scope user
claude plugin install i9-skills@i9-skills --scope user --json
claude plugin list --json
claude --init-only --debug-file <absolute-log>
claude mcp list
claude mcp get plugin:i9-skills:<mapping-at-selected-pin>

git -C <source> -c core.hooksPath=/dev/null switch --detach <full-SHA>
codex plugin add i9-skills@i9-skills --json
claude plugin update i9-skills@i9-skills --scope user --json

codex plugin remove i9-skills@i9-skills --json
codex plugin marketplace remove i9-skills --json
claude plugin uninstall i9-skills@i9-skills --scope user --keep-data --json
claude plugin marketplace remove i9-skills --scope user
```

For Codex, the installed app-server's `skills/list` and `hooks/list` RPCs report
loaded skills and hook trust. Review the actual command and source, then trust
only the observed hash using its native `config/batchWrite` interface. The first
turn uses an unauthenticated custom provider with Responses protocol, websockets
disabled, zero retries and a five-second idle limit. The local fixture bounds
requests to three and bodies to 1 MiB, rejects unexpected methods/paths and emits
fixed SSE response events. The plan specifies isolation checks and assertions.
Never substitute a real provider merely to complete this test.

Record versions, source/cache digests, native results, sandbox checks, preserved
data and cleanup for each new run. Keep raw RPC/debug logs outside published
artifacts; they can contain host paths and synthetic prompts. Recheck installed
help and schemas when a client version changes. Native clients and networked
installation do not become dependencies of the ordinary repository test suite.

## Evidence limits and references

Native Read-tool telemetry, real-model skill selection/task quality, interactive
Claude trust, online dependency preparation, hosted updates, Windows behavior,
Copilot runtime and public-directory acceptance were not exercised. Codex MCP
mapping was outside this A/B/A round and is covered by the separate linked pilot.
Direct runtime tests and repository CI provide separate evidence.
This pilot does not authorize publication or installation into a real profile.

The Codex diagnosis used immutable source
`687a119f0fcaace47e1f1abcc77cec6c813fd6da`: [queued SessionStart](https://github.com/openai/codex/blob/687a119f0fcaace47e1f1abcc77cec6c813fd6da/codex-rs/core/src/session/session.rs#L1889),
[first-turn dispatch](https://github.com/openai/codex/blob/687a119f0fcaace47e1f1abcc77cec6c813fd6da/codex-rs/core/src/session/turn.rs#L320),
[native hook trust](https://github.com/openai/codex/blob/687a119f0fcaace47e1f1abcc77cec6c813fd6da/codex-rs/tui/src/hooks_rpc.rs)
and the [official loopback fixture](https://github.com/openai/codex/blob/687a119f0fcaace47e1f1abcc77cec6c813fd6da/codex-rs/app-server-test-client/src/loopback_responses_server.rs).
Claude commands were verified against the installed binary's help and native
diagnostics; its [plugin loading guide](https://code.claude.com/docs/en/plugins/loading)
describes the host integration boundary.
