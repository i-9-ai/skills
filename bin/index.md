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

`CommandConfiguration` registers each public route explicitly. Source filenames
match their `Command` classes; they do not become CLI names. The source and packed
launchers load the same map.

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
node bin/index.mjs repo validate --project .
node bin/index.mjs repo validate-official --project .
node bin/index.mjs repo verify-release --project .
node bin/index.mjs collection audit --collection ./example-skills --layout repository
node bin/index.mjs skills onboarding
node bin/index.mjs skills observe --snapshot ./snapshots/before --subject ./subject.json
node bin/index.mjs skills report bump --file ./comparison.json --limit 20
node bin/index.mjs skills memory summarize --db /absolute/local-data/skill-usage.db --collection demo --from 2026-09-01T00:00:00.000Z --until 2026-10-01T00:00:00.000Z
node bin/index.mjs skills memory retention --db /absolute/local-data/skill-usage.db --collection demo --from 2026-09-01T00:00:00.000Z --until 2026-10-01T00:00:00.000Z --cutoff 2026-09-15T00:00:00.000Z
node bin/index.mjs collection plan --collection ./example-skills --layout repository --audit ./audit.json
node bin/index.mjs collection evolve --collection ./example-skills --layout repository --plan ./plan.json
node bin/index.mjs context available-skills --project ./example-project --no-global
node bin/index.mjs context available-skills --global-root ./installed-skills --max-entries 50
node bin/index.mjs hook list
node bin/index.mjs hook session-config --host codex
node bin/index.mjs hook verify --host codex --file .codex/hooks.json
node bin/index.mjs hook session-index
node bin/index.mjs hook telemetry-enable --host claude --file /project/.claude/settings.json --collection project=/project/.agents/skills
node bin/index.mjs hook telemetry-enable --host claude --file /project/.claude/settings.json --collection project=/project/.agents/skills --executable /usr/local/bin/i9-skills --write
node bin/index.mjs hook telemetry-status --host claude --file /project/.claude/settings.json
node bin/index.mjs hook telemetry-disable --host claude --file /project/.claude/settings.json
node bin/index.mjs catalog search --query authoring --limit 10
node bin/index.mjs catalog read --skill skill-authoring
node bin/index.mjs catalog overview --max-entries 12
node bin/index.mjs mcp serve
node bin/index.mjs mcp serve --db /absolute/local-data/skill-usage.db
node bin/index.mjs telemetry record --db /absolute/local-data/skill-usage.db --file event.json
node bin/index.mjs telemetry rankings --db /absolute/local-data/skill-usage.db
node bin/index.mjs telemetry trends --db /absolute/local-data/skill-usage.db --interval month
node bin/index.mjs telemetry catalog-observe --db /absolute/local-data/skill-usage.db --file catalog.json
node bin/index.mjs telemetry lifecycle --db /absolute/local-data/skill-usage.db --from 2026-09-01T00:00:00.000Z --until 2026-10-01T00:00:00.000Z
node bin/index.mjs plugin prepare --output .work/plugin-preview/i9-skills
node bin/index.mjs plugin submission --output .work/public-candidate/i9-skills
```

Use each command's `--help`. Project resolution: the command's explicit root flag
(`--project` for context, `--root` for plugin preparation), then
`I9_SKILLS_PROJECT_ROOT`, then this CLI's checkout. `ProjectConfiguration`
resolves that selection once and derives its local skill, Codex hook and catalog
paths without reading or creating them. Bundled `catalog search/read/overview` and
MCP access instead select the running installed package, ignoring that project
override and cwd. Filesystem validation remains in repositories. Global discovery defaults
to the shared agent state's `skills/`: `I9_AGENT_STATE_ROOT` selects that root,
otherwise the current user's `.agents` root is used. `--global-root` explicitly
overrides the skill directory; `--no-global` disables global discovery, including
default path resolution. Native plugin DATA variables do not alter discovery.
Tests use synthetic paths only.

`repo validate --project PATH` runs local collection checks after `npm ci`, without
Python or additional downloads. `repo validate-official` also runs the pinned
Agent Skills validator and may install its pinned Python environment; use the
prepared [validation workflow](../docs/Validation.md). It verifies conformance,
not skill behavior or publication readiness. The `npm run validate` and
`npm run ci:official` scripts still select these operations. The earlier standalone
`validate` and `ci-official` CLI spellings have been removed before the first release.

## Version preparation

For an authorized version-preparation task in a trusted source checkout:

```sh
node bin/index.mjs repo prepare-version --project .
node bin/index.mjs repo verify-release --project .
```

`repo prepare-version` invokes the pinned development Changesets CLI, consumes
pending notes and updates `package.json`, `CHANGELOG.md`, root lockfile version
fields and the three root plugin manifests. It prints JSON with `version`,
`changed` and consumed `notes`; no notes returns a successful no-op. It requires
the standard single-package Changesets configuration and aligned input versions.
Failure restores the captured release files. It never installs dependencies,
commits, pushes or publishes.

`repo verify-release` checks version alignment without writing to the selected
checkout. After committing the prepared files, add `--base <full-base-commit-sha>`
to verify an exclusive generated-release diff and recompute the expected version
from that base's notes in a disposable fixture. This mode needs Git history, a
clean tracked worktree and the development Changesets dependency; unrelated
changes or fabricated version evidence fail. Neither release command implicitly
downloads the dependency if it is absent.

The npm equivalents are `npm run release:prepare` and `npm run release:verify`.
Read [release management](../docs/Release%20Management.md) for the manual draft-PR
workflow, bot-run approval, review and recovery. These commands support repository
maintenance, not consumer installation or automatic publication.

## Skill observations and change reports

`skills observe` verifies an existing schema-2 snapshot and exports a pinned
inventory, optional source assertions and caller-supplied validation/review.
`skills report bump` compares two observations and a complete assessment;
insufficient or contradictory evidence returns `undetermined`. Neither operation
changes versions or evidence databases. `skills onboarding` returns a versioned
installed guide with complete synthetic examples, without executing them.
See [skill change reports](../docs/Skill%20Change%20Reports.md) for fields, limits
and the inspect-through-report walkthrough. Report and guide data are also
available through `skill_bump_report` and `skill_onboarding` in the shared MCP.

## Collection maintenance

`collection audit` inspects an explicitly selected collection and reports bounded
structural findings. `collection plan --audit FILE` rechecks that evidence and
produces supported operations plus semantic handoffs. `collection evolve --plan
FILE` previews without writes; adding `--apply --snapshot-store ABSOLUTE_PATH`
applies supported catalog synchronization after stale-state and recovery checks.
No home/default collection is selected. Malformed catalogs and content changes
remain explicit handoffs. Read [collection maintenance](../docs/Collection%20Maintenance.md)
for complete commands, limits, snapshot receipts and failure recovery.

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

`mcp serve` starts the single stdio server for bundled skill search, Markdown
retrieval and overview plus explicit read, lifecycle and catalog evidence. Initialization and
catalog calls require no data directory and create no state. A valid record opens
the selected dedicated SQLite database and applies migrations; evidence queries open
existing valid storage read-only. A missing database is unavailable, not zero
history. CLI telemetry and plugin hooks/MCP default to the shared
`~/.agents/skills-usage.db`. `I9_AGENT_STATE_ROOT` selects another state root;
`I9_SKILLS_USAGE_DB` selects a database; explicit `--db` wins. Native plugin DATA
variables never silently replace that default. Select a legacy `skill-usage.db`
explicitly to keep its history; no stores are moved, merged or deleted. A valid
record can create safe missing parents, while queries never initialize state.
Keep plugin state outside installed files and the consuming project. Legacy MCP
processes start in the plugin and cannot infer that consumer exclusion.
Standard output contains protocol messages only. Read the
[MCP contract](../docs/Skill%20MCP.md) for all tools, bounds and provenance.
The former `mcp usage` route is removed before the first release; manually copied
MCP client configurations must use `mcp serve`.

The explicit `telemetry` commands store typed session starts, read attempts and
successful reads with occurrence/correlation UUIDs. Queries are read-only;
optional bounded logs retain categories and IDs. Read the complete
[telemetry contract](../docs/Skill%20Telemetry.md) before choosing an emitter.

Schema-2 `telemetry record` explicitly reports routing, activation or one terminal
outcome. `telemetry catalog-observe` records a complete caller inventory.
`telemetry lifecycle`, `overlap`, `inactivity` and `catalog-history` query that
evidence with an explicit period of at most 366 days; matching MCP tools use the
same services. Queries never create or upgrade storage. Read the
[lifecycle guide](../docs/Lifecycle%20Evidence.md) for full event examples, source
identity, ratio denominators, missing coverage and history paging. File reads
never imply activation or completion.

`skills memory summarize` composes bounded lifecycle, catalog and read summaries
from that same existing store. `skills memory retention` reports evidence before
and after an optional cutoff inside the requested period. Both require an explicit
collection and UTC period, open storage read-only, and make no retention decision
for the caller. Missing approval, validation or migration receipts remain
unrecorded rather than inferred from events. See the
[skill memory guide](../docs/Skill%20Memory.md) for complete examples, identity
tiers, limits and the distinction between inspection and deletion.

`hook telemetry-config --host claude --db /absolute/local-data/usage.db
--collection project=/absolute/project/.agents/skills` prints an optional
observation registration. `hook observe` maps reviewed Codex Bash, Claude Read,
Gemini read_file or Copilot CLI view events into the shared store. Codex verifies
only literal cat/sed output after collection identity confinement. Claude/Codex
native call IDs pair attempts and reads; first receipt time survives retries.
Gemini/Copilot use their bounded native timestamps without claiming reliable
pre/post pairing. All adapters count only discovered SKILL.md entrypoints.
Implicit loading, reference files and unsupported tool/response shapes remain
outside coverage. The [host contract](../docs/Host%20Hooks.md) explains limits
and nonblocking failure.
No host registration is installed or enabled by these commands.

`hook telemetry-enable --host HOST --file ABSOLUTE_SETTINGS --collection
LABEL=ABSOLUTE_SKILLS` previews optional setup for Codex, Claude, Copilot or
Gemini. The settings parent must already exist and be canonical. Add `--write`
only for an authorized reviewed merge; a sibling ownership receipt records the
exact inserted entries. The default invocation uses the current Node executable
and CLI launcher. `--executable ABSOLUTE_PATH` instead selects a stable installed
CLI. A launcher resolved from an npx cache requires that cache to remain available;
status reports missing runtime paths. No install or network request runs at hook
time, and setup creates no evidence database.

`hook telemetry-status --host HOST --file ABSOLUTE_SETTINGS` inspects owned
registration and runtime availability without changing settings or proving host
trust/event delivery. `hook telemetry-disable` previews removal; `--write`
removes only exact unchanged owned entries. It preserves unrelated settings and
the usage database. Modified entries or receipts require review and are not
silently overwritten. Native host trust remains a separate user action. See the
[telemetry setup guide](../docs/Skill%20Telemetry.md).

## Failures and the single entrypoint

Argument and validation errors return nonzero. Discovery failures return
partial or empty context with warnings. Database failures preserve existing
history; stop the MCP process and diagnose its directory/schema.

`bin/index.mjs` is the only CLI launcher. The root plugin additionally has a
direct stdio MCP entrypoint so it can start without CLI dependencies. No legacy
CLI launchers or command aliases are retained.

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

The shared global catalog default is `<agent-state>/skills-catalog.json`; global
catalog maintenance still requires explicit `--collection` and `--layout global`.
Do not silently relocate a caller's catalog. Aggregate output remains explicitly
selected and outside every source catalog directory. For a global source at
`/data/agent-state/skills-catalog.json`, choose another owned directory such as
`/data/catalog-index`; its `skills-catalog.db` must stay separate from both source
inventories and `skills-usage.db`. JSON fallback is current lookup, not a migration
of SQLite history. The [architecture path map](../docs/Architecture.md#path-ownership-and-shared-agent-state)
records these distinct owners.

## Host adapters and packed distribution

Use hook session-config --host codex|claude|copilot|gemini|antigravity|hermes and hook verify
--host HOST --file FILE for standalone configuration. Use hook session-index
--host HOST for its documented output envelope. Read the [host contract](../docs/Host%20Hooks.md)
before proposing installation; generation and fixture tests do not enable a host.

Run npm run build and npm run package:check for the allowlisted compiled artifact.
The same launcher uses source TypeScript in the checkout and JavaScript in the
packed package. Read [distribution preparation](../docs/Distribution%20Readiness.md)
for actual coverage and the separate publication gate. The public npm manifest
does not authorize publishing; the reviewed release workflow and maintainer
authority govern that action separately.

`plugin prepare --output .work/plugin-preview/i9-skills` previews a separate
inert plugin artifact. Create the staging parent explicitly; add `--write` to
create its new child. Existing destinations are refused. Read the
[plugin guide](../docs/Plugin%20Preparation.md) for manifests, integrity receipts,
bounded inputs and retained partial-write recovery. It never registers a
marketplace, installs a consumer or enables an integration.

`plugin submission --output .work/public-candidate/i9-skills` previews a
skills-only manual-submission candidate. Create the neutral staging parent
explicitly, then add `--write` to create the new folder, sibling ZIP and integrity
summary. Existing outputs are refused. The projection excludes telemetry hooks,
MCP, executable repository tooling and host state; it is distinct from an optional
local runtime plugin. Preparation does not upload, register, approve or publish
the candidate. Read the [plugin preparation guide](../docs/Plugin%20Preparation.md)
before carrying out the separate human submission.
