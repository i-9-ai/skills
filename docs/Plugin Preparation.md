# Prepare and verify the repository plugin

The repository root is the plugin. Its Codex, Claude Code and Copilot manifests
at `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json` and
`.github/plugin/plugin.json` all reference the same canonical `.agents/skills`
tree. The Codex marketplace entry at `.agents/plugins/marketplace.json` points
to `./`, the repository root. Claude Code and Copilot have matching marketplace
entries at `.claude-plugin/marketplace.json` and
`.github/plugin/marketplace.json`. `npm run check` verifies these paths and the
cataloged packages. There is no checked-in copy under `plugins/`.

The Claude Code plugin declares the local `i9-skill-usage` MCP in
`mcp/claude.json`. It starts the dependency-free Node 24 server in
`src/transport/PluginUsageMcpServer.ts`. It stores a dedicated
`skill-usage.db` in the host's persistent plugin data directory, never in the
installed plugin or the current project. The server exposes
`skill_read_record` and `skill_read_rankings`; it records only explicit read
evidence supplied by a caller. Loading the plugin does not observe reads or
activate skills. The MCP protocol was tested from a clean copy without
`node_modules`; native Claude plugin ingestion and subprocess behavior still
need a consumer test. Codex and Copilot retain skills-only root plugin manifests:
their legacy MCP loading paths do not document both plugin-root substitution
and a persistent plugin-data directory. Do not register an MCP that will fail
on startup. A later adapter may map it after those host contracts and a clean
installation are verified.

Claude Code can remove the persistent data directory on final plugin uninstall.
Use its `--keep-data` option when the observed-read history must remain available
after removal; an external database selected by the CLI's `--db` belongs to its
caller instead.

Hooks have a different readiness boundary. `.codex/hooks.json` is a *project*
registration for this checkout. The CLI can generate Claude, Copilot and other
host-specific project registrations, but those commands currently rely on the
checkout's oclif/YAML dependencies after explicit `npm ci` and resolve the Git
root. None is declared as a plugin-bundled hook: an installed plugin may be
copied elsewhere without those dependencies or a Git checkout. Before adding
plugin hook paths to the manifests, provide an independently runnable handler
for each host and test it in a clean installed copy. Keep each host's event
name, output envelope and trust review separate; a common hook JSON file would
misrepresent their contracts. Claude's successful `Read` telemetry remains an
explicit project adapter, not automatic plugin measurement.

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

## Verification and future marketplace use

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

The repository [marketplace manifest](../.agents/plugins/marketplace.json)
references `./`, the repository root. After this
branch is merged, an authorized consumer can import the marketplace with
`codex plugin marketplace add i-9-ai/skills --ref main` and then install with
`codex plugin add i9-skills@i9-skills`. A private repository requires Git access
for that consumer. The checked-in manifests prepare those steps;
they do not execute them, prove native ingestion or make the repository public.
Before public marketplace use, verify the exact merged ref, plugin UI rendering,
package count, and update behavior in a consumer environment. Public directory
submission and workspace publication remain separate authorization boundaries.

Claude Code and Copilot CLI can likewise read their repository marketplace
files after a consumer explicitly adds this Git repository as a marketplace.
Both entries select the root plugin, so they distribute the same canonical
packages. Claude also maps the observed-read MCP. The marketplace entries do
not install or activate the checkout-only hooks. Validate marketplace loading
and the Claude MCP subprocess before claiming consumer support.
See the [Claude marketplace contract](https://code.claude.com/docs/en/plugin-marketplaces)
and [Copilot CLI plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference)
for their host-specific registration and trust steps.
