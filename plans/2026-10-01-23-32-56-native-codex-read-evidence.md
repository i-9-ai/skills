# Native Codex skill-read pilot

The isolated native lane on 2026-10-01 verified one literal entrypoint read
through the installed plugin, completing the native evidence acceptance in
[issue #70](https://github.com/i-9-ai/skills/issues/70). It followed the
[approved isolated pilot boundary](2026-09-29-19-38-34-native-plugin-pilot.md),
using the real Codex tool and hook runtime against two fixed, unauthenticated
loopback Responses replies. This proves native dispatch and local evidence
ingestion; it does not test a real model, remote provider, billing, skill
comprehension or every supported shell shape.

## Candidate and verified host contract

| Item | Observed value |
| --- | --- |
| Plugin source commit | `5843aa8c7a0713eaaf7ea0b6eae7c5f794904ec4` |
| Codex CLI | `0.159.3` |
| Codex source | `01fc69f4026735edfdf6789820549727a4867b11` |
| Node.js | `24.21.0` |
| Synthetic entrypoint | `synthetic-read-proof/SKILL.md` |
| Confirmed returned selection | 193 UTF-8 bytes |
| Evidence revision | `unknown` |

The official `rust-v0.159.3` annotated tag
`8e46774a94a745ffdf676bd7a8aa36466bbd4f99` resolves to the Codex source above.
The official comparison with the previously reviewed `0.159.2` source
`ff6aec96948b70d94983af2641a6b67c94faeff5` changes TUI/Cargo files, without
changing the core tool or hook contract. The
[tool context implementation](https://github.com/openai/codex/blob/01fc69f4026735edfdf6789820549727a4867b11/codex-rs/core/src/tools/context.rs)
supplies the post-hook raw textual output separately from model-facing execution
headers, and
[canonical hook names](https://github.com/openai/codex/blob/01fc69f4026735edfdf6789820549727a4867b11/codex-rs/core/src/tools/hook_names.rs)
map the native `exec_command` call to `Bash`.

Actual PreToolUse and PostToolUse payloads had `cwd`, `hook_event_name`,
`session_id`, `tool_name`, `tool_use_id`, `tool_input`, `model`,
`permission_mode`, `transcript_path` and `turn_id`. The input had only the
normalized `command` field. PostToolUse added `tool_response`, a string exactly
matching the synthetic entrypoint bytes. Pre/post carried the same session and
tool-use identifiers. Evidence retains key names, types, hashes and opaque
identities; it retains no native IDs, command body, prompt, transcript path,
tool-response body or entrypoint content.

## Isolation, native execution and query

The harness used a fresh host HOME, CODEX_HOME, XDG state/cache and temporary
root, an empty file-backed credential store, and a separate synthetic consumer.
The native client confirmed it was unauthenticated. A Seatbelt profile denied
external network and writes outside the owned proof root. Only the fixture's
exact loopback port was allowed. Before and after the turn, outside writes,
external connections and another loopback port returned `EPERM`.

The disposable source was cloned without local object links and detached at the
candidate commit. Native marketplace/plugin commands registered its root plugin.
The actual `hooks/list` entries were inspected, and only their observed hashes
were trusted with `config/batchWrite`; no hook-trust bypass was used. A separate
disposable project hook captured only sanitized payload shape evidence. Plugin
source/cache file hashes matched the selected source bytes.

The stub emitted exactly one known `exec_command` function call containing a
literal `cat` on that synthetic entrypoint, then one fixed assistant completion.
Both HTTP requests had no authorization, cookie or API-key headers. The native
SessionStart, PreToolUse and PostToolUse plugin events all completed. The native
turn was ephemeral. Raw payloads and responses were examined only in memory.

A first nested read-only native sandbox attempt failed because macOS rejected
`sandbox_apply` inside the already active Seatbelt profile. The installed plugin
correctly recorded the attempt without a confirmed read. The successful lane
disabled only the inner native sandbox while retaining the externally enforced
Seatbelt profile and the same fixed single-call provider. This is an isolation
qualification, not an unrestricted native session.

The selected external SQLite store contained exactly one `session.started`, one
`skill.read.attempted` and one `skill.read.observed`. Attempt and observation
shared correlation, identified collection `project` and skill
`synthetic-read-proof`, and retained unavailable revision as `unknown`.
The installed dependency-free MCP server's existing `skill_read_rankings` query
returned one row with `reads: 1` and `sessions: 1`. That query preserved the
database byte hash. Source and consumer snapshots stayed unchanged.

Only the disposable plugin and marketplace registrations were removed afterward.
The evidence database was retained. Every owned child process and loopback
listener stopped. Earlier denied/failed harness lanes retain separate sanitized
receipts rather than being counted as passes.

## Source and harness byte binding

| Verified resource | SHA-256 |
| --- | --- |
| `hooks/codex.json` | `380602139f9db4c0d251c2cac8a420b95b86aa1a0a3c3b859356596d0a1d7548` |
| `src/transport/PluginHookRunner.ts` | `7d12cabe76b16212bf5ed4b260efc280929f11b169fca448c083b609e210ec5d` |
| `src/service/CodexTelemetryAdapter.ts` | `efb382efb2f28761d42abf9a57dde08eaf30fb38189f1e971a7a071faba6b02e` |
| `src/service/HookTelemetryService.ts` | `8246f6908cbf99154401d54fb43cba5a7ca79f607cc5c657a9b2536c26c5674f` |
| `src/repository/ShellSkillReadRepository.ts` | `13cf747fffcc278a2f0d15a2c8bee10686d5ec01ea486846604c3d13b613d77c` |
| Native proof runner | `f7f0e5e943f229164521afdcbbb3afcb240bade6a6e7f8729bafd88d52f4e958` |
| Strict Responses stub | `5177810b5b022ba5a9967301eb91e9552f2e8534d8d3c7fab56d4a05e2759487` |
| Synthetic entrypoint / exact post-hook response | `ef2c3d1150946562e5707e4b5bd1ab4e2c0f1fb0bffef4d8a7fc9022e4c695ce` |
| Base Seatbelt profile | `81bf9d13bdfe434f478acbb346e4915f0e70301e6a0a69b159b64dc3c10cce8e` |
| Exact-loopback client profile | `bb925ccdf6944e8a35e5c27fe4384af5dcc3f03f554a4eba845d99efaacb9c1d` |
| Bind/inbound-only fixture server profile | `543efad6c509da5d8de041e7737649e3bd08978827d30442d2d66feb9d578421` |

Profile hashes bind the actual disposable-root/port-specific profiles. Their
portable policy was default allow, network deny and file-write deny, followed by
write permission only for the owned proof root and `/dev/null`. The client added
outbound permission only to its exact owned loopback port; the server added bind
and inbound permission only on that port and retained outbound network denial.
The measured denial checks, not environment-variable selection alone, establish
the confinement result.

Comparison with the integrating working tree found no difference in the five
observer resources listed above. A later commit can reuse this bounded native
evidence only after reconciling those bytes; this report does not certify
unrelated code added after the selected source commit.

The temporary runner and stub are operator proof artifacts, not ordinary test
dependencies. Repeat the approved isolated-pilot procedure against every changed
observer revision. Preserve fixture-only versus actual native execution, exact
source bytes, strict trust, provider isolation and measured coverage separately.
