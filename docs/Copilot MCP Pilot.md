# Copilot legacy MCP mapping and native evidence

The Copilot CLI legacy manifest now loads the same Node.js 24+ TypeScript MCP
server as the other plugin adapters. It keeps `.agents/skills` as the canonical
skill collection. No skills are copied into a second delivery directory, and no
Agent Plugins format migration is required.

## Configuration and data boundary

The root `.github/plugin/plugin.json` references `mcp/copilot.json`. The mapping
launches `node ${PLUGIN_ROOT}/src/transport/PluginMcpServer.ts --host copilot` and
exposes the existing `i9-skills` tools. Node.js 24+ must be available on the
client's `PATH`; plugin loading does not install dependencies or run setup.

The legacy adapter uses only an explicitly supplied `COPILOT_PLUGIN_DATA` value
for evidence storage. The mapping passes it through the MCP `env` field. It does
not use `PLUGIN_DATA`, `CLAUDE_PLUGIN_DATA`, or a home-directory fallback. For
example, after selecting an external data directory and an authorized plugin
source:

```sh
COPILOT_PLUGIN_DATA=/absolute/external/i9-evidence \
  copilot --plugin-dir /absolute/path/to/i9-skills
```

`--plugin-dir` mounts that source for the process; it does not establish a
persistent plugin installation. Omit the data variable when only bundled catalog,
resource, overview, bump-report or onboarding access is needed. Those operations
and MCP initialization create no evidence database. Explicit record operations
also remain subject to the client's tool permissions.

In the observed legacy loader, an unset `${COPILOT_PLUGIN_DATA}` remains literal.
The runtime rejects that non-absolute value, just as it rejects empty or relative
paths. Evidence operations return `storage_unavailable`; catalog operations
continue to work. The first valid explicit record may create the external
`skill-usage.db` and apply its migrations. Queries never initialize missing
storage. Other existing path, link and database guards remain in force.

The native MCP child's working directory is the plugin root. This legacy loader
did not provide the consumer's directory, so the adapter cannot independently
reject a data path inside that unknown consumer. The operator must select data
outside both the installed plugin and the consuming project. The installed-root
and symlink protections are enforced by the runtime.

Automatic persistent `PLUGIN_DATA` provisioning in GitHub's documentation applies
to Agent Plugins, not this legacy manifest. If a client version cannot load this
mapping or supply the explicit environment value, use the portable command with
an explicitly selected database:

```sh
i9-skills mcp serve --db /absolute/external/i9-evidence/skill-usage.db
```

See the [MCP contract](https://github.com/i-9-ai/skills/wiki/Skill-MCP) for inputs and bounds, and
[lifecycle evidence](https://github.com/i-9-ai/skills/wiki/Lifecycle-Evidence) for the distinction between caller
assertions, observed reads and independently verified outcomes. Reading a skill
does not record activation or a successful task.

## Sources and provenance

Reviewed on 2026-09-29:

- GitHub's rendered [plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference)
  establishes the legacy manifest locations and file-backed `mcpServers` field,
  and separates Agent Plugins data semantics.
- GitHub's rendered [MCP configuration guide](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers)
  documents local stdio configuration and explicit environment fields. Native
  observations below establish the narrower legacy-plugin expansion behavior.
- The official CLI repository at
  [`8dfa6009c4a04b3a22a5ca4a7c36a056edd718dd`](https://github.com/github/copilot-cli/tree/8dfa6009c4a04b3a22a5ca4a7c36a056edd718dd)
  provides release documentation, not the compiled loader's implementation.
  The probe used the official `@github/copilot-darwin-arm64@1.0.89` distribution
  after verifying its npm SHA-512 integrity. No install script ran.
- The official SDK's
  [client](https://github.com/github/copilot-sdk/blob/a2b2c18eb5a20417fc613eaaa93199f55ad22ea4/nodejs/src/client.ts),
  [session](https://github.com/github/copilot-sdk/blob/a2b2c18eb5a20417fc613eaaa93199f55ad22ea4/nodejs/src/session.ts)
  and [RPC contract](https://github.com/github/copilot-sdk/blob/a2b2c18eb5a20417fc613eaaa93199f55ad22ea4/nodejs/src/generated/rpc.ts)
  supplied the headless stdio, no-auto-login, session MCP and explicit permission
  request shapes. The probe installed no SDK dependency and sent no model turn.

The first two sources were inspected as live rendered pages, with the original
tool-return excerpts retained. Repository metadata resolved `github/docs` revision
`339429df5ad02314aa9976e27dde0c17b3b910f6` and raw download locators, but those raw
Markdown bodies were not inspected or byte-compared to the rendered text. The
revision is a reference locator, not an exact-source identity for those excerpts.
The pinned SDK files and the native CLI observations supply separate evidence.

These sources were consulted for interfaces. No upstream executable, source code,
skill payload or other licensed asset is redistributed by this change. The
official executable and its supplied license remain in the private probe data.

| Probe identity | Value |
| --- | --- |
| CLI and protocol | Copilot CLI `1.0.89`, RPC protocol `3` |
| Platform | macOS `27.2`, arm64 |
| MCP runtime | Node.js `24.21.0` |
| Official executable SHA-256 | `97c12874d9adb9738374a9fb8a52cd724b81132ff815140f7e017bac706feba7` |
| Candidate source base | `a0768d19d418c65597320207e15b7f259e97591b` |
| Copied payload | 387 files, with the five candidate overlays below |

The native run exercised a candidate payload, not an already reviewed feature
commit. Its retained receipt records every copied file. The runtime's Git
provenance fields correctly remain null in this copy; the external receipt pins
its source instead. Exact-commit review and final repository checks are separate
gates.

| Candidate overlay | SHA-256 |
| --- | --- |
| `.github/plugin/plugin.json` | `9b314c4cf244f3ae5a9b060f15b48ca095867c08af4f0bfb58ca191b8cd81a87` |
| `mcp/copilot.json` | `16590d1a62f5944abac49336208c578cb270aced250b07925b1ef801bf5af573` |
| `src/config/PluginDataConfiguration.ts` | `9ea35f3ca35a9070fa2db8c4a815366e6d5c60a588d0aa176031897db8fc42a4` |
| `src/service/SkillMcpService.ts` | `57332ecda16407dc575357baf0ef48ee8f093e4d9b38727393fc27f0eb594403` |
| `src/transport/PluginMcpServer.ts` | `fe3cc5de368ebe61026f8a856f52dc6e2ac89c8680c2ae5228957178fd3d80af` |

## Native observations

The probe used a fresh synthetic home, configuration/cache/temp directories,
consumer and plugin copy whose path contained spaces. Its environment was
constructed from explicit values, without inherited credentials. Operating-system
preflight confirmed denial of network access, real-profile reads and writes
outside the fixture; the selected Node installation was the only allowed subtree
of the real user home. Built-in MCPs, automatic login and auto-update were disabled.

The native CLI ran with `--headless --stdio --no-auto-update --no-auto-login` and
the ephemeral plugin directory. RPC calls created a local session, listed MCP
tools, initialized the offered tool set, and invoked named tools directly.
There was no prompt, model turn, authentication or successful network operation.

| Check | Observed result |
| --- | --- |
| Legacy registration | The native session identified `i9-skills` as a plugin MCP server and connected it. |
| Mapping | `${PLUGIN_ROOT}` resolved to the installed copy; the child's cwd was that root. No data directory or consumer path was automatically supplied. |
| Discovery | All 13 current tools were returned by `session.mcp.listTools`. |
| Catalog | A native `skill_catalog_search` call returned the installed `skill-authoring` metadata and catalog digest. |
| Missing data | Explicitly permitted synthetic record calls and rankings returned `storage_unavailable`; Codex/Claude variables were ignored. |
| Explicit data | One permitted synthetic `skill_read_record` call recorded a read, its retry returned `recorded: false`, and rankings showed one read in one session. |
| Read-only query | A later native rankings call preserved the database SHA-256. |
| Source and consumer | All 387 installed file paths and hashes matched; the consumer remained empty. |
| Cleanup | Every session was destroyed and its process group stopped. A new session without the plugin mount had no MCP servers. No process retained an open file under the fixture. |
| Data preservation | The database SHA-256 remained `8a8b237f0f29bfe8ac77754454f72fa1c6e6a41b1b3f648b6be1acce1551928c` across the read-only query and removal of the ephemeral mount. |

The first direct record attempts were denied by the native client's permission
boundary. The final probe handled `permission.requested` and approved only the
named synthetic `i9-skills-skill_read_record` request; it did not grant general
tool access. Standalone `copilot mcp list` did not enumerate the `--plugin-dir`
server in the tested invocation. Session RPC discovery is the evidence for
loading, and direct RPC execution is the evidence for these tool results.

The focused Node 24 regression checks passed 29 tests across Copilot, Codex,
Claude/shared MCP and data configuration, plus the root-manifest test. They cover
missing/invalid/linked/installed data, host isolation, idempotence, read-only
queries and unsupported selectors using disposable fixtures. Those tests resolve
the observed mapping offline; they do not replace the native observations.

This evidence does not establish interactive model selection, a successful task,
persistent Copilot marketplace installation/update/uninstall, hosted-directory
acceptance, other operating systems, or compatibility with another CLI version.
No real profile or published artifact was changed. Preserve external evidence
data when removing this optional mapping.
