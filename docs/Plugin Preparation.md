# Prepare and verify the repository plugin

The repository root is the plugin. Its Codex, Claude Code and Copilot manifests
at `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json` and
`.github/plugin/plugin.json` all reference the same canonical `.agents/skills`
tree. The Codex marketplace entry at `.agents/plugins/marketplace.json` points
to `./`, the repository root. Claude Code and Copilot have matching marketplace
entries at `.claude-plugin/marketplace.json` and
`.github/plugin/marketplace.json`. `npm run check` verifies these paths and the
cataloged packages. There is no checked-in copy under `plugins/`.

The Codex, Claude Code and Copilot plugins declare the local `i9-skills` MCP in
`mcp/codex.json`, `mcp/claude.json` and `mcp/copilot.json`. They start the dependency-free Node 24 server
in `src/transport/PluginMcpServer.ts --host codex|claude|copilot`. It provides read-only bundled
catalog search, selected Markdown resources and bounded overview without a data
directory. Explicit `skill_read_record` and `skill_read_rankings` calls use a
shared `~/.agents/skills-usage.db` by default, outside
installed files and the caller's project. Initialization and catalog access never
create it; rankings require existing valid state. Reading instructions through
the MCP does not record evidence, infer activation or monitor tools. The plugin's
separate native hooks observe only the reviewed entrypoint events described below.

The old `i9-skill-usage` registration and usage-only entrypoint were replaced;
update manually copied configurations. The [MCP guide](https://github.com/i-9-ai/skills/wiki/Skill-MCP) provides
tool calls, CLI equivalents, identity/limit rules and version-pinned invocation.
Clean-copy protocol tests without `node_modules` are separate from native Claude
ingestion and subprocess tests. The [native pilot](https://github.com/i-9-ai/skills/wiki/Native-Plugin-Pilot)
records successful Claude initialization at pinned revisions. The
[Codex MCP pilot](https://github.com/i-9-ai/skills/wiki/Codex-MCP-Pilot) separately proves native registration and
explicit tool calls. The [Copilot MCP pilot](https://github.com/i-9-ai/skills/wiki/Copilot-MCP-Pilot) records
native session discovery and direct calls through an ephemeral plugin mount;
it does not establish a persistent marketplace installation.

Codex's mapping resolves `cwd: "."` against the installed plugin and forwards
`I9_AGENT_STATE_ROOT` and `I9_SKILLS_USAGE_DB`. CLI and native hooks/MCP share
`~/.agents/skills-usage.db`, regardless of automatically supplied `PLUGIN_DATA`
or host-prefixed DATA variables. An explicit database override wins; select an
old `skill-usage.db` filename explicitly to retain legacy history. No store is
renamed, merged or deleted. Keep selected state outside installed files and
consumer projects. The runtime rejects relative, linked and plugin-contained
locations, but the MCP process cannot infer the original consumer cwd; that
exclusion remains the operator's duty.

Copilot's mapping expands `${PLUGIN_ROOT}` for the server path and uses the same
shared configuration. It does not pass an unresolved DATA placeholder or infer
the consumer cwd. Valid records can create safe selected state directories;
catalog/report/guide calls and read-only queries never create or upgrade storage.

The shared database remains caller-owned rather than plugin-owned. If an
explicit override selects a native plugin's own legacy DATA directory, follow
that host's uninstall data-preservation procedure; the shared default does not
depend on the host retaining that directory.

The Codex, Claude and Copilot manifests declare their respective
`hooks/codex.json`, `hooks/claude.json` and `hooks/copilot.json` files.
They call `PluginHookRunner.ts` directly on Node 24,
without Git, oclif, YAML dependencies, a build or a globally installed CLI.
Each receives session context; native telemetry maps only Codex literal cat/sed
Bash, Claude Read and Copilot CLI view receipts. Host trust and plugin enablement still
control execution. The runtime never fetches dependencies or changes permissions.

Session context discovers the installed plugin's canonical collection, the
event cwd's `.agents/skills`, and the current HOME's `.agents/skills`. Real-path
duplicates merge their source labels. It provides at most 24 entries within a
4096-character context budget and reports omitted entries or incomplete coverage.
The dependency-free parser supports the bundled skills and ordinary plain,
quoted and block-scalar summaries; unsupported foreign YAML is skipped with a
coverage warning. The prepared CLI retains its full YAML parser. Descriptions
are discovery hints; read the chosen SKILL.md before applying its instructions.

Native metrics use the same shared usage default and explicit overrides as MCP.
Only safe selected state outside plugin/consumer paths may be initialized.
Unavailable storage produces a fixed diagnostic and skips metrics while retaining
session context. Codex requires exact current-file/output agreement; Copilot and
Gemini native timestamps cannot reliably pair attempts with observations.
`hooks/gemini.json` is available as a reviewed configuration example, without
claiming a Gemini extension installation.
See [host hooks](https://github.com/i-9-ai/skills/wiki/Host-Hooks#installed-plugin-hooks) for launch examples,
supported events, state constraints and failure behavior.

`.codex/hooks.json` remains a separate *project* registration for this checkout;
the CLI-generated project registrations use prepared checkout dependencies.
Avoid enabling both project and plugin session registrations for the same work,
because hosts can combine them and duplicate context. Removing the plugin's hook
manifest reference disables that surface without removing stored metrics.
Direct clean-copy transport tests do not prove native host installation, trust
acceptance or end-to-end delivery of host events. The [isolated native pilot](https://github.com/i-9-ai/skills/wiki/Native-Plugin-Pilot)
passed discovery, SessionStart, local source replacement and rollback in Codex
0.159.0 and Claude Code 2.1.277. It records the tested trust path, Claude's offline
dependency warning and Codex's stubbed first turn, without claiming model quality
or native Read-tool telemetry.

The manifests use host-specific compatibility formats because the portable
Agent Plugins 1.0 format fixes skill discovery at a root `skills/` directory.
A root `plugin.json` would therefore lose the required `.agents/skills` path.
Codex, Claude Code and Copilot each support an explicit legacy `skills` path.
Gemini CLI reads project `.agents/skills` in a checkout, but its extension format
also fixes bundled skills at root `skills/`; this repository does not claim a
Gemini extension install. Other hosts need their own verified integration.

The npm CLI and plugin remain separate distribution surfaces. The optional
`plugin prepare` command creates a disposable portable staging artifact when a
consumer requires the fixed `skills/` layout. To preview it without touching
tracked files, select a new neutral directory:

```sh
mkdir -p .work/plugin-preview
node bin/index.mjs plugin prepare --output .work/plugin-preview/i9-skills
node bin/index.mjs plugin prepare --output .work/plugin-preview/i9-skills --write
```

The first command only previews the manifest, package/file counts, destination
and inventory digest. `--write` creates the artifact. The parent directory must
already exist, and its new child must be named `i9-skills`. An existing child,
including a link, is an error. Use another parent for a later candidate.
`--root` selects an I-9 Skills checkout or unpacked npm package; otherwise the
shared project configuration selects `I9_SKILLS_PROJECT_ROOT` or the CLI's own
package. Generation also works from the compiled npm artifact.

The optional staging layout is:

```text
i9-skills/
  plugin.json
  .codex-plugin/plugin.json
  artifact-receipt.json
  LICENSE
  skills/
    <actual-catalog-name>/
      SKILL.md
      LICENSE
      ...complete package resources and scoped notices...
```

The catalog is checked for freshness. Each package passes the local package
validator, and all package bytes are inspected before any output is created.
Only actual catalog packages and the root license/optional notice are included.
Repository instructions, CLI implementation, host configuration and local logs
are excluded. Package scripts are copied as inert bytes and never executed.

The staged root `plugin.json` targets Agent Plugins 1.0.0 with discovery through
`skills/`. Its compatibility manifest declares the same identity/version and
skills path, plus minimal OpenAI presentation metadata. Both derive shared
fields from package.json. Neither advertises hooks, apps, MCP connections or
model gains. These staged manifests are distinct from the tracked root host
manifests, which reference `.agents/skills` directly.
The [official packaging contract](https://developers.openai.com/plugins/build/plugins)
and [portable manifest schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json)
were checked on 2026-09-19; native ingestion and UI rendering remain untested.

`artifact-receipt.json` records sorted paths, byte sizes, normalized file modes
and SHA-256 digests. Its inventory includes both manifests and excludes the
receipt itself to avoid a self-hash. It contains no absolute source paths or
timestamps. Repeating a preview over unchanged bytes yields the same digest.
Files use 0644, or 0755 when the source has an executable bit; the staging root
is private to its owner. Source links, hard links and special files are rejected.
Package limits remain 4 MiB per file and 32 MiB per package; the aggregate is
bounded to 64 MiB and 10000 files. Reads use the existing stable-workspace
filesystem checks, which do not claim confinement against hostile concurrent
mutation.

The plugin profile rejects empty source directories before output rather than
silently dropping them and invalidating a directory link. Every final path,
including the `skills/<name>/` prefix, must fit the shared 24-component and
1024 UTF-16-code-unit relative-path bounds. Preview checks this conversion as
well as the source package; a package that passes standalone validation can
still exceed the plugin profile. Refusal preserves the source and creates no
partial artifact for these preflight failures.

Staging conservatively refuses any hidden directory followed by `skills` or
`plugins`, `.config/<namespace>/skills` or `plugins`, and `.system`. It checks
both selected and canonical paths, including nested targets, so an ancestor
alias cannot bypass this rule. The rule covers common host roots without a
fixed list of host names; it also excludes similarly shaped custom directories.
Neutral scratch inside a managed worktree remains usable. Select an owned
scratch directory and keep other writers away during preparation. A failed
write retains its new partial directory for inspection and returns nonzero;
manifests are written last. Never install a partial artifact. The command does
not delete, overwrite, repair or clean existing artifacts.

## Install in Codex

The repository contains a Codex marketplace with one root plugin. Consumers can
install it directly from GitHub; a public OpenAI directory listing is not a
prerequisite. Use a Codex client with plugin marketplace support and Node.js 24+
on the executable search path for its hooks and MCP.

```sh
codex plugin marketplace add i-9-ai/skills --ref main
codex plugin add i9-skills@i9-skills
codex plugin list
```

`i9-skills@i9-skills` identifies the plugin and marketplace, respectively; it is
not a version selector. The marketplace entry points to the repository root,
and the plugin manifest selects `.agents/skills`, its hook and its MCP. No
second skills source tree or `npm ci` is needed for these plugin runtimes.
Start a new session after installation and confirm that the plugin is enabled.
Avoid enabling both the installed plugin session hook and the checkout's project
session hook in the same session.

### Local-folder installation

Clone a checkout when you want to inspect or develop the plugin locally, then
register its existing marketplace:

```sh
git clone https://github.com/i-9-ai/skills.git
codex plugin marketplace add ./skills
codex plugin add i9-skills@i9-skills
codex plugin list
```

An existing checkout's absolute path can replace `./skills`. Keep that source
folder while using its local marketplace. Choose the GitHub or local source for
the `i9-skills` marketplace; they share the same identity.

For supported desktop clients, restart the app after configuring the marketplace,
open the Plugins Directory, choose **I9 Skills**, and install or enable **I-9
Skills**. Opening this trusted repository also exposes its checked-in repo
marketplace. Workspace-managed availability may require an administrator's
import; local CLI registration does not override that policy. See the
[OpenAI marketplace setup documentation](https://developers.openai.com/plugins/build/plugins#add-a-marketplace-from-the-cli)
for client-specific controls.

### Verify, update and remove

`codex plugin list` should show `i9-skills` in the `i9-skills` marketplace as
installed. In a new session, check that its 24 skills and `i9-skills` MCP are
available and that the session hook completes. An absent `node` executable or
Node version below 24 prevents the bundled runtimes from starting; installation
alone does not prove their execution.

For a Git-backed marketplace, refresh its source and install the selected plugin:

```sh
codex plugin marketplace upgrade i9-skills
codex plugin add i9-skills@i9-skills
codex plugin list
```

For a local source, update that checkout first, then reinstall and restart the
client. Recheck the installed version and capabilities after an update; the
native pilot verifies local replacement, not every client's hosted update cache.
To uninstall the plugin and optionally stop tracking its marketplace:

```sh
codex plugin remove i9-skills@i9-skills
codex plugin marketplace remove i9-skills
```

These commands manage plugin installation and marketplace registration. They do
not delete caller-owned evidence storage or the source checkout.

## Verification and marketplace boundaries

`npm run check` exercises preview, source rejection, no-overwrite and exact
package byte preservation with disposable data. `npm run package:check`
generates the complete plugin from the actual compiled npm package under
node_modules, using only already installed production dependencies.

For this repository-root plugin, validate each host manifest against its
host's current contract and run `npm run check`. The bundled plugin-creator
helper currently insists that `skills` resolve to root `skills/`, so it rejects
this deliberate `.agents/skills` compatibility path; that helper cannot certify
the root layout. Claude Code's own `claude plugin validate .` can check its
manifest. For an optional staged artifact, check its root `plugin.json` against
the official portable schema. Record the validator/schema identities and
results outside distributed packages. Run official `skills-ref validate` on
each changed skill. Structural checks do not replace an explicitly authorized
installation test in each intended consumer.

The repository [marketplace manifest](https://github.com/i-9-ai/skills/blob/main/.agents/plugins/marketplace.json)
references `./`, the repository root. GitHub and local-folder registration and
installation use the same root plugin. The consumer must be able to fetch its
selected source. The checked-in manifests do not execute installation. Public
directory submission and workspace publication remain separate from installing
this repository marketplace. Verify plugin UI rendering, package count and
update behavior in the intended consumer; the isolated source pilot does not
establish universal client behavior.

Claude Code and Copilot CLI can likewise read their repository marketplace
files after a consumer explicitly adds this Git repository as a marketplace.
Both entries select the root plugin, so they distribute the same canonical
packages. Claude also maps the catalog/evidence MCP and installed hooks. Codex maps
its own session hook and the MCP with explicit storage configuration; Copilot
maps the catalog/evidence MCP through its verified legacy plugin adapter with
caller-selected external storage. See the [Copilot MCP pilot](https://github.com/i-9-ai/skills/wiki/Copilot-MCP-Pilot)
for its native evidence and remaining installation/update limits. Marketplace
metadata does not grant trust or establish native execution. Validate each
host's marketplace loading, hook delivery and any MCP subprocess before claiming
consumer support.
See the [Claude marketplace contract](https://code.claude.com/docs/en/plugin-marketplaces)
and [Copilot CLI plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference)
for their host-specific registration and trust steps.
