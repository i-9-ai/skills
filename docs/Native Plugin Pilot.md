# Native plugin pilot

The isolated pilot on 2026-09-29 passed native registration, 24-skill discovery,
SessionStart execution, local source replacement and rollback in Codex and Claude
Code. Claude's MCP initialization also passed. No repository runtime defect was
found in this scope. This is evidence for the versions and source commits below,
not a claim about every host, model or later revision. The subsequent
[Codex MCP pilot](https://github.com/i-9-ai/skills/wiki/Codex-MCP-Pilot) adds native tool discovery and explicit
catalog/read-evidence calls; the historical A/B/A results below remain unchanged.

## Repeatable operator

`plugin pilot` prepares and executes explicitly selected lanes of a Codex/Claude
lifecycle matrix in fresh, owned containers. It is an installation and lifecycle
check. It does not score
the usefulness of a skill or establish model task quality. Use concrete tasks
and privately selected reference packages for those separate evaluations.

```sh
npx @i-9.ai/skills plugin pilot --request /staging/native-pilot/operator.json --execute
```

The registry command requires a release containing this interface. In a prepared
source checkout, use `node bin/index.mjs plugin pilot` with the same flags.

Keep the request and acquired inputs in a separate staging directory. The closed
request has exactly these fields:

```json
{
  "schema_version": 1,
  "contract_path": "/staging/native-pilot/contract.json",
  "inputs_path": "/staging/native-pilot/inputs.json",
  "container_pin_path": "/staging/native-pilot/container-pin.json",
  "preparation_root": "/staging/native-pilot/new-run",
  "lanes": [
    { "run_id": "00000000-0000-4000-8000-000000000001", "host": "codex", "repetition": 1 },
    { "run_id": "00000000-0000-4000-8000-000000000002", "host": "claude", "repetition": 1 }
  ]
}
```

The paths above are examples, not acquired inputs. Use a fresh UUID and new
preparation directory for each run. A complete repeated matrix selects both
hosts at repetitions 1 and 2. `inputs.json` maps `source_a`, `source_b`, `driver`,
`observer`, `node`, `codex` and `claude` to canonical absolute acquired paths;
the contract binds their complete inventories and exact review receipts. The
container pin binds the local Docker boundary, platform image and measured normal
account. A caller assertion does not replace those byte and runtime checks.

The request selects immutable source A/B, reviewed driver and observer bytes,
native executable identities, a measured container image and fresh lane outputs.
It cannot select an arbitrary shell command. Without `--execute`, the command
rejects the request before preparation or native execution. Inputs must already
be acquired and reviewed; the operator never downloads clients, installs into a
real profile or substitutes a real model provider to complete a failing lane.

The prepared phase journal covers native versions, baseline state, installation,
hook/MCP observations, local A → B → A replacement, removal and owned-resource
cleanup. Use contract schema 2 and select the bundled internal observer
`dist/transport/NativePilotNativeObserverRunner.js` for a compiled export, or its
`src/transport/NativePilotNativeObserverRunner.ts` development counterpart. This
fixed container dispatcher serves both hosts; it is not a second public CLI.

The bundled parser rechecks retained native records, full loaded package/resource
inventories and state evidence. Codex uses its pinned RPC schemas, native hook
trust and completion, actual MCP catalog/resource responses and one bounded local
response exchange. The total request count includes rejected requests, so an extra
request cannot disappear from the proof. Its baseline/removal recipe uses no
thread or turn and requires the fresh lane's native inventories to be empty.
Claude uses seven fixed version, auth, plugin, MCP health and init-only calls at
A, B and restored A. It verifies the loaded source bytes and actual SessionStart
output; MCP health does not prove catalog or resource tool calls.

Claude's native hook/MCP absence inventory is still unsupported. That required
gate stays false, and the schema-2 lane stops at baseline instead of proceeding
under a diagnostic exception. The operator therefore cannot yet approve a complete
two-host lifecycle matrix. For an unsupported gate, retain its raw records and
use the pinned host's documented manual inspection inside the same disposable
boundary. Record the exact unresolved gate and the commands, output and state
comparisons needed to inspect it; manual evidence does not change the automated
verdict. Do not fall back to a real profile or a model conversation.

A prepared phase is not an observed result; failed and unattempted phases remain
visible. Process proof binds two live PID/start-time/parent samples to the
worker-observed child, rather than accepting a collector's asserted PID. Nested
timeouts now use a 60-second common phase while preserving the 40-second native
lifetime, 42-second selected-child minimum, one-second child rescue and one-second
phase finish. Preparation has at most 16 seconds before selected dispatch; a
smaller remaining budget still refuses to launch the child.

This correction is implemented in source with fake deadline and dispatch tests.
Two fresh 60-second Codex repetitions dispatched the selected observer and
installed matching source A bytes, but both stopped at `observe-a` with
`evidence-integrity-mismatch`: the observer's provenance envelope was compared
with a bare inventory by its consumer. Closed producer/consumer validation is
now implemented with matching and rejection tests under the
[loaded-inventory plan](https://github.com/i-9-ai/skills/blob/main/plans/2026-10-05-19-09-13-loaded-native-inventory-contract.md).
Neither repetition reached B, rollback or removal. Complete native acceptance
remains pending; these failures must not be regraded after a source correction.
The new validator checks the complete envelope against the selected source and
its exact declared alias omissions. Claude's before/after snapshots, manifest
bytes and two worker inventories must agree. Unknown fields and overstated
provenance are rejected; the native-cache and executable-bit limits remain.
Earlier 45-second failed captures retain
their original budgets and verdicts. Their four-gate baseline candidate result
does not establish the separately blocked native absence observation. See the
[budget plan](https://github.com/i-9-ai/skills/blob/main/plans/2026-10-05-18-02-45-native-observation-budget.md)
for the measured preparation times, unchanged limits and required verification.
An unknown process or socket state blocks advancement; a measured zombie
residual is retained as a terminated residual, never relabeled as process absence.

After the loaded-inventory correction, a later Codex repetition completed all
20 candidate phases. Its second repetition stopped at restored A because the
selected MCP status was still `starting`. That response is startup evidence,
not a connected server. The readiness correction permits bounded status queries
within the existing request and time limits; only a complete inventory with the
selected server connected permits catalog/resource calls. Historical failures
remain unchanged.

A separate private Claude diagnostic captured its init-only operation, but the
export projector rejected the client's absolute `native-output/latest` debug
alias. The captured process completed; its generic adapter-error verdict is not
proof of a timeout. The correction retains only this known alias to an ordinary,
byte-verified debug file for the selected run and repetition. It never follows
or materializes the link. This diagnostic does not remove the public schema-2
absence limitation or establish a complete two-host matrix.

SQLite preservation has two explicit outcomes: absent storage stays absent, or
existing storage stays unchanged during read-only operations. Seeded lanes retain
the original file and sidecar bytes, issued schema identities and prior user-table
payloads. A valid migration ledger cannot hide modified SQL or a removed index.
Unsupported state is retained as blocked; it is never reset or downgraded merely
to obtain a passing result.

The seeded contract requires `existing_unchanged` for read-only MCP evidence.
Snapshots bracket Codex's selected native MCP operations and Claude's MCP list/get
health calls before its init hook writer. The host rechecks the main SQLite file,
every retained sidecar, issued SQL and row/payload identities. Empty receipt lists
cannot establish an existing store. At restored A, complete preceding-state and
history comparisons establish `data_preservation: observed`. The current
recipes exercise catalog/resource reads and hook context, so selected-source
database API compatibility remains `data_compatibility: not-exercised` and
`full_data_compatibility` stays false. Preserved history cannot prove that an
older reader or writer accepts a newer schema. The later Codex trial retained
schema 4 while selected source A supports schemas 1-3; the original positive
compatibility label is historical output qualified by that limitation. No
native reader/writer refusal is inferred from source inspection, and migration
guards are never bypassed to obtain compatibility.

The CLI returns a local report receipt and a nonzero status when execution is
incomplete. Raw profiles, RPC/debug output, source exports and research artifacts
stay outside the repository, npm package, plugin and Wiki. Source identity,
synthetic orchestration tests, installed native evidence and independent acceptance
are separate claims. The 2026-09-29 results below apply only to their recorded
pins; a new operator run does not inherit them.

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

The separate [2026-10-01 native read proof](https://github.com/i-9-ai/skills/blob/main/plans/2026-10-01-23-32-56-native-codex-read-evidence.md)
adds installed Codex 0.159.3 SessionStart, PreToolUse and PostToolUse delivery for
one literal synthetic entrypoint read. The actual returned bytes produced one
attempt, one confirmed read and one distinct-session ranking through the local
MCP. It used strict native hook trust and a confined unauthenticated loopback
fixture; it did not use a real model or user profile. Its exact observer hashes
and coverage limits are separate from the historical A/B/A results above.

Native Read-tool telemetry was not exercised in the historical A/B/A round;
real-model skill selection/task quality, interactive
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
