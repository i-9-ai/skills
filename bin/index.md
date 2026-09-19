# Unified skills CLI

## Runtime and entrypoint

`index.mjs` checks Node.js 24+ and starts the TypeScript CLI in `src/`.
Run `npm ci` explicitly in this checkout first. Commands never install
dependencies or compile code at startup. `npm run typecheck` checks types;
native type stripping only executes erasable syntax.

`.node-version` records the verified Node 24.19.0 development runtime. The
launcher accepts Node 24+; an ambient newer Node is not evidence of Node 24 testing.

Checkout execution uses native TypeScript. The explicit build/package check
prepares compiled JavaScript for node_modules; no runtime build runs implicitly.

## Commands

### Development formatting

Run `npm run format` to format CLI source, the launcher, unit tests and CLI
integration tests. `npm run format:check` verifies the same scope without writing
and runs as part of `npm run check`. Package content and collection fixtures are
excluded. The formatter uses four-space code indentation and preserves logical
blank lines; Markdown wrapping is configured as `preserve` and prose is not part
of these commands.

Configure your editor's Prettier integration to use this workspace's installed
Prettier and `.prettierrc.json`, respecting `.prettierignore`. Format-on-save is
optional; no editor settings or extensions are installed by the CLI.

### CLI examples

```sh
node bin/index.mjs --help
node bin/index.mjs validate
node bin/index.mjs ci-official
node bin/index.mjs context available-skills --project ./example-project --no-global
node bin/index.mjs context available-skills --global-root ./installed-skills --max-entries 50
node bin/index.mjs hook list
node bin/index.mjs hook session-config --host codex
node bin/index.mjs hook verify --host codex --file .codex/hooks.json
node bin/index.mjs hook session-index
node bin/index.mjs mcp usage --db /absolute/local-data/skill-usage.db
node bin/index.mjs telemetry record --db /absolute/local-data/skill-usage.db --file event.json
node bin/index.mjs telemetry rankings --db /absolute/local-data/skill-usage.db
node bin/index.mjs telemetry trends --db /absolute/local-data/skill-usage.db --interval month
```

Use each command's `--help`. Project resolution: explicit `--project`, then
`I9_SKILLS_PROJECT_ROOT`, then this CLI's checkout. `ProjectConfiguration`
resolves that selection once and derives its local skill, Codex hook and catalog
paths without reading or creating them. Filesystem validation remains in repositories. Global discovery defaults
to the current user's `.agents/skills`; `--global-root` overrides it and
`--no-global` disables it. Tests use synthetic paths only.

## Discovery

`context available-skills` reads current package metadata from project and
global directories. It excludes hidden directories including `.system`,
deduplicates real package paths, and retains distinct same-name packages with
source labels. Neither a fixed list nor a stale catalog controls selection.
Installed metadata is a shortlist; host execution support must still be checked.

Limits: 4096 directory entries per source, 1024 packages, eight namespace
levels, 128 KiB per entrypoint. Unsupported frontmatter, invalid entrypoints
and broken links produce incomplete-coverage warnings. Linked packages are
read, but linked namespaces are not traversed. The compact overview defaults
to twenty displayed entries, supports up to 100, and discloses omissions.

## Hooks and metrics

`hook session-index` provides the reusable overview at a lifecycle boundary.
The Codex matcher owns startup/resume/clear/compact selection. The command is
also a manual fallback and writes context only. `hook session-config --host codex`
prints the Codex configuration; `hook verify --host codex` only compares its contents.
Neither command enables or installs a hook.

`mcp usage` starts a stdio server and applies checksum-verified migrations
to the caller-owned dedicated SQLite database. Explicit calls record observed
reads and query period rankings. Standard output contains protocol messages
only. See the [usage contract](../docs/skill-usage-mcp.md).

The explicit `telemetry` commands store typed session starts, read attempts and
successful reads with occurrence/correlation UUIDs. Queries are read-only;
optional bounded logs retain categories and IDs. Read the complete
[telemetry contract](../docs/skill-telemetry.md) before choosing an emitter.

`hook telemetry-config --host claude --db /absolute/local-data/usage.db
--collection project=/absolute/project/.agents/skills` prints an optional
observation registration. `hook observe` maps native Claude Read events into
the shared event store: attempts and successes remain distinct, stable host
occurrences deduplicate, and first receipt time survives retries. It records
entrypoint reads only; Bash, implicit loading and reference files are outside
coverage. The [host contract](../docs/host-hooks.md) explains failure behavior.
No host registration is installed or enabled by these commands.

## Failures and the single entrypoint

Argument and validation errors return nonzero. Discovery failures return
partial or empty context with warnings. Database failures preserve existing
history; stop the MCP process and diagnose its directory/schema.

`bin/index.mjs` is the only executable entrypoint. No legacy launchers or
command aliases are retained; all integrations use the commands above.

Run `npm run check`, `npm run changeset:status`, and `git diff --check`.

## Collection catalog maintenance

Use catalog inspect, catalog check, or catalog sync with explicit --collection
and --layout repository|global. Inspect validates the manifest; check additionally
tests freshness; sync --dry-run reports the target and added/removed/refreshed
names without writes. Sync alone atomically updates only skills-catalog.json.
Repeat --allow-package-link-root for trusted global package owners.

Aggregate commands are catalog aggregate inspect/check/sync/rebuild. Supply
--index for reads, repeat --source id=PATH for checks/writes, and select an
existing --output directory outside every source collection for writes. SQLite
is the default and sync preserves history; --format json retains current state
only. Rebuild rejects existing SQLite history without --reset-history. There is
no aggregate dry-run: inspect/check and a verified backup precede explicit writes.

## Host adapters and packed distribution

Use hook session-config --host codex|claude|copilot|gemini|antigravity|hermes and hook verify
--host HOST --file FILE for standalone configuration. Use hook session-index
--host HOST for its documented output envelope. Read the [host contract](../docs/host-hooks.md)
before proposing installation; generation and fixture tests do not enable a host.

Run npm run build and npm run package:check for the allowlisted compiled artifact.
The same launcher uses source TypeScript in the checkout and JavaScript in the
packed package. Read [distribution preparation](../docs/distribution-readiness.md)
for actual coverage and the separate publication gate. The package stays private.
