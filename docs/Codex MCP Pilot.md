# Native Codex MCP mapping evidence

Observed on 2026-09-29. This is an additional issue #12 lane, separate from the
earlier native A/B/A hook and Claude MCP pilot. No retained pilot directory was
reused.

## Scope and result

Codex CLI 0.159.0, Node 24.21.0 and RTK 0.50.0 loaded the candidate legacy plugin
MCP mapping through actual native marketplace/plugin registration. Its app-server
reported `i9-skills` connected with plugin identity `i9-skills@i9-skills` and eleven
tools. Direct native calls searched the installed skill catalog, returned the
24-package overview, rejected usage without data configuration, and recorded and
queried one synthetic read when `PLUGIN_DATA` was explicitly supplied.

No model turn was submitted. No response stub, authentication, hook-trust change,
real model request, production installation or publication was involved.

## Source identity

The source fixture was cloned locally with `--no-local --no-hardlinks --no-checkout`
and detached at `79acc8004bc472a49ae5164e4bb2ca2338d419e5`. Two candidate files were
overlaid in that disposable clone: `.codex-plugin/plugin.json` added
`mcpServers: ./mcp/codex.json`; the referenced file declared:

```json
{
    "mcpServers": {
        "i9-skills": {
            "type": "stdio",
            "command": "node",
            "args": ["src/transport/PluginMcpServer.ts", "--host", "codex"],
            "cwd": ".",
            "env_vars": ["PLUGIN_DATA"]
        }
    }
}
```

This run proves that candidate configuration against the named base. The PR
records a fresh exact-commit rerun and its complete tool count before merge;
the later bump/onboarding tools have separate implementation tests. This initial
candidate evidence remains distinct from that rerun. The JSON and hashes here
describe the historical overlay. The current `mcp/codex.json` additionally
forwards `I9_AGENT_STATE_ROOT` and `I9_SKILLS_USAGE_DB`; the runtime ignores
`PLUGIN_DATA` when choosing evidence storage. This change has repository test
coverage and is not established by the historical native run.

| Candidate source file              | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `.codex-plugin/plugin.json`        | `0147fc210bc9f10b1649dcd1c696c5ed81033068cbd0113d0d1ad85a6069d95b` |
| `mcp/codex.json`                   | `e66bfeb645db670af4bac9732fb21bbac65cb6e61cd90fdd209a6dc97b40b614` |
| `src/transport/PluginMcpServer.ts` | `6ebd608a092f227dbf38c1c48cc50b604156bf0e1d9cd4550d26b641faee6362` |
| `src/service/SkillMcpService.ts`   | `c0d0c4347e64b4150b8ec67884c99b0db74babdffb8f0f760dc2769046a64d08` |
| `skills-catalog.json`              | `ea9d297818c7ba3ff83513a128c46c74bec2826f9dcf76319e074e675ee350fd` |

## Independent host-source evidence

All host references use OpenAI Codex source revision
`687a119f0fcaace47e1f1abcc77cec6c813fd6da`. The upstream files were inspected as
evidence; no upstream implementation was copied into the collection.

- [Legacy loader](https://github.com/openai/codex/blob/687a119f0fcaace47e1f1abcc77cec6c813fd6da/codex-rs/core-plugins/src/loader.rs#L1648): the legacy branch calls the parser with the plugin root; host plugin-data injection belongs to the distinct Agent Plugins branch.
- [Legacy parser](https://github.com/openai/codex/blob/687a119f0fcaace47e1f1abcc77cec6c813fd6da/codex-rs/codex-mcp/src/plugin_config.rs#L68): its normalization resolves a relative `cwd` against the plugin root. It does not interpolate hook variables into command arguments or provision `PLUGIN_DATA`.
- [MCP configuration](https://github.com/openai/codex/blob/687a119f0fcaace47e1f1abcc77cec6c813fd6da/codex-rs/config/src/mcp_types.rs#L513): stdio accepts explicit `env_vars` and `cwd`.
- [Native MCP request processor](https://github.com/openai/codex/blob/687a119f0fcaace47e1f1abcc77cec6c813fd6da/codex-rs/app-server/src/request_processors/mcp_processor.rs#L75) and [direct tool-call test](https://github.com/openai/codex/blob/687a119f0fcaace47e1f1abcc77cec6c813fd6da/codex-rs/app-server/tests/suite/v2/mcp_tool.rs#L104): native tools can be called through an existing thread without submitting a model turn.

The installed client's generated protocol independently lists
`mcpServerStatus/list` and `mcpServer/tool/call`, with required `threadId`, `server`
and `tool` for the latter. Passing `PLUGIN_DATA` was then proven by native write
and query behavior rather than inferred from hook behavior.

## Isolation and native procedure

The fixture used fresh source, consumer, HOME, CODEX_HOME, XDG and temporary
directories. Every native subprocess received a constructed environment, file
credential storage and disabled analytics/remote-model discovery. No inherited
credential environment was passed. Authentication reported `Not logged in` before
and after the run.

The native process wrapper was:

```text
rtk proxy /usr/bin/sandbox-exec -f <pilot>/sandbox.sb <executable> <arguments>
```

The profile denied all networking and all writes outside the fresh pilot root,
except `/dev/null`. Preflight observed an allowed fixture write plus `EPERM` for
an outside write, a newly allocated owned loopback listener, and a TEST-NET
destination. The preflight listener was closed before native plugin execution.

Native commands registered the local marketplace, installed the plugin, and
confirmed enabled inventory. The actual app-server received `initialize`, then
`initialized`, and `thread/start` with the synthetic consumer cwd,
`ephemeral: true`, `approvalPolicy: never` and `sandbox: read-only`. An unused
authentication-free synthetic provider with websockets disabled prevented normal
provider prewarm; the OS still denied all network access. No `turn/start` request
exists in either RPC request log.

Each data lane then used:

```text
mcpServerStatus/list { threadId }
mcpServer/tool/call { threadId, server: "i9-skills", tool, arguments }
```

Both app-server processes exited zero with empty stderr. The registered native
server reported tools capability and connected runtime status. Catalog search
returned `skill-design` from the installed bundle; overview reported 24 distinct
packages. No direct manual launch of `PluginMcpServer.ts` underlies these native
claims.

In the historical candidate, without `PLUGIN_DATA`, both `skill_read_record` and `skill_read_rankings` returned
`isError: true` with `storage_unavailable`. With `PLUGIN_DATA` set to the selected
external fixture directory, `skill_read_record` returned `recorded: true` and
rankings returned one read in one synthetic session.

## Data and cleanup

The selected store was outside plugin source, installed cache and consumer. The
database retained checksum-verified migration rows 1, 2 and 3. It contained one
`usage_reads` row and zero `usage_events`, `lifecycle_events` or
`catalog_observations` rows. Read-only inspection and native unregister preserved
the database SHA-256:

```text
4548109b15bda74f954b5cf658c643874595bdd5b9f0842bc2ca34979ac6d2e5
```

Snapshot assertions passed for source, loaded plugin and consumer before/after
both RPC lanes. Native plugin and marketplace removal completed, and final
inventories were empty. All recorded app-server process groups were absent.

The first cleanup process audit reported only its own `rtk`/`lsof` processes
because that audit used the consumer as its cwd. The final audit used a cwd
outside the pilot and returned no open process paths. Its separate result and
the initial diagnostic remain retained; the initial assertion is not represented
as a native plugin failure.

## Repository regressions and limits

The mapping needs Node 24 but no CLI dependencies, build or global installation.
It shares the [MCP service](https://github.com/i-9-ai/skills/wiki/Skill-MCP) with the CLI and Claude plugin. Catalog
access, onboarding and reports do not initialize evidence storage. The current
default is `~/.agents/skills-usage.db`; `I9_AGENT_STATE_ROOT` changes the shared
root, and an explicit absolute `I9_SKILLS_USAGE_DB` takes precedence. Native
plugin-data variables do not select storage. Preserve an earlier database by
selecting its exact filename; no automatic migration or history merge occurs.
See [shared storage](https://github.com/i-9-ai/skills/wiki/Skill-Telemetry).

For a new replay, create disposable home, Codex configuration and data directories
outside the source and consumer, then select them explicitly:

```sh
env -i PATH="$PATH" HOME=/absolute/disposable-home \
  CODEX_HOME=/absolute/disposable-home/.codex \
  I9_SKILLS_USAGE_DB=/absolute/disposable-data/skills-usage.db codex
```

Use a reviewed configuration for the host actually running the plugin. A desktop
process may not inherit a terminal's environment. This example selects isolated
storage; repeat the pilot's OS sandbox and constructed configuration for its
network, authentication and write-isolation claims. Only a valid record may
initialize the selected database; discovery and
read-only catalog calls never create it. Follow the
[native pilot plan](https://github.com/i-9-ai/skills/blob/main/plans/2026-09-29-19-38-34-native-plugin-pilot.md) with a fresh
isolated profile for reproduction. Keep raw host logs outside the repository.

At the pilot revision, five dedicated offline mapping tests passed under Node 24.21.0: path-with-spaces
catalog access and no data fallback; explicit external data with idempotent
recording and read-only rankings; rejection of installed, relative and linked
data paths. The repository-root manifest test also passed. Those fixture tests
exercise the resolved mapping; they do not simulate native host compatibility.

The legacy mapping sets process cwd to the installed plugin. The runtime cannot
infer the consuming thread's separate cwd; the operator must select data outside
that consumer. It remains accurate to claim rejection of plugin-contained,
relative or linked data, but not independent enforcement of an unknown consumer
path. The historical mapping explicitly forwarded `PLUGIN_DATA` instead of
relying on host provisioning; the current runtime ignores it for storage.

This lane proves local native registration, tool discovery and direct MCP tool
execution only. It does not prove model-selected tool use, skill activation,
hosted version updates, provider connectivity, real-model quality or publication.
