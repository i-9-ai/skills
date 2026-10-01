# Skill catalog and explicit evidence

One local MCP exposes this installed collection's instructions and explicit
read, lifecycle and catalog evidence. Catalog lookup tools only read bundled files; they do not record
usage, activate skills, scan the caller's home or execute package scripts.
Recording evidence requires a separate explicit call with evidence from its emitter.

## Start

Use Node.js 24+ and run `npm ci` explicitly in the checkout first. Configure a
stdio MCP client with command `node` and arguments pointing to `bin/index.mjs`,
`mcp`, and `serve`. Run from a checkout:

```sh
node bin/index.mjs mcp serve
# Optional caller-owned evidence storage, required only for usage operations:
node bin/index.mjs mcp serve --db /absolute/local-data/skill-usage.db
```

The [MCP Inspector walkthrough](https://github.com/i-9-ai/skills/wiki/MCP-Inspector) shows a pinned client setup,
tool listing, catalog search and selected Markdown reads against this checkout.
It includes argument ordering, expected output, diagnostics and cleanup; the
guide distinguishes source-checked instructions from an actual Inspector run.

The [unified CLI](https://github.com/i-9-ai/skills/blob/main/bin/index.md) uses the same service and transport as the
dependency-free `src/transport/PluginMcpServer.ts --host claude|codex|copilot` entrypoint.
The host registrations are named `i9-skills` in their respective
`mcp/claude.json`, `mcp/codex.json` and `mcp/copilot.json` files. The former `mcp usage`
route, usage-only class names and `i9-skill-usage` registration were replaced
before the first release; update manually copied client configurations.

Initialization, tool listing, search, resource reads and overview require no data
directory and create no database. Only an explicit valid record may initialize
the selected dedicated usage database. Evidence queries require existing valid storage
and open it read-only. Missing state is reported as unavailable, not empty history.
An explicit CLI `--db` selects a caller-owned absolute path. Otherwise CLI and
plugin MCP use the shared `~/.agents/skills-usage.db`; `I9_AGENT_STATE_ROOT`
selects another state root, and `I9_SKILLS_USAGE_DB` overrides the database alone.
Automatic native DATA variables never select a different store. A valid record
may create safe non-linked parent directories; initialization and queries never
do. Explicitly select an old `skill-usage.db` filename to preserve a legacy store:
no database is moved, merged, reset or deleted by changing the default.
Codex's mapping forwards the shared state/database overrides. Its process cwd
is the installed plugin, so it cannot infer the consuming thread's project cwd.
Keep selected state outside that consumer; the runtime rejects relative, linked
and plugin-contained locations. See the
[native Codex MCP pilot](https://github.com/i-9-ai/skills/wiki/Codex-MCP-Pilot) for source and runtime proof.
Copilot's mapping uses the same shared configuration and does not forward an
unresolved plugin DATA placeholder. It cannot identify the consumer cwd from
its plugin-root process. Its historical native session RPC loading and
tool calls are recorded in the [Copilot MCP pilot](https://github.com/i-9-ai/skills/wiki/Copilot-MCP-Pilot).
Both adapters retain explicit CLI configuration as a fallback. The linked pilots
describe earlier revisions and do not certify the new shared-default behavior.

For an explicit public Git-source launch on Node 24 and npm 12, use the
[distribution guide](https://github.com/i-9-ai/skills/wiki/Distribution-Readiness#run-directly-from-github), then run:

```sh
npx --yes --allow-git=root github:i-9-ai/skills mcp serve
```

The initial call downloads the source/build dependencies and runs preparation;
stdout remains reserved for MCP protocol messages. This is an explicit client
launch, not an automatic session setup hook.

A client using a published build can launch the registry package directly:

```sh
npx --yes @i-9.ai/skills mcp serve
```

This explicitly permits npm to obtain the package; it is not an installation
step performed by a hook. For a reproducible client configuration, append an
exact verified release version to the package name. For unreleased development use
the checkout command above or the [local tarball test](https://github.com/i-9-ai/skills/wiki/Distribution-Readiness).
Automatic hooks continue to use their installed local runtime.

## Search, then read

Use `skill_catalog_search` to shortlist metadata:

```json
{"query":"authoring","limit":10,"offset":0}
```

The literal query is at most 200 characters. Limit is 1–50 (default 20); offset
is 0–256. Results contain `skills`, `total`, `offset`, `limit` and `next_offset`.
Metadata is an untrusted shortlist, not the skill instructions. Empty searches
and pagination still expose totals and omissions truthfully.

Read an actual selected entrypoint with `skill_resource_read`:

```json
{"skill":"skill-authoring","resource":"SKILL.md"}
```

When that entrypoint calls for a bundled reference, request it explicitly:

```json
{"skill":"skill-authoring","resource":"references/tooling.md"}
```

`resource` defaults to `SKILL.md`. Only that file or Markdown below the selected
package's `references/` directory is available, up to 64 KiB. Results include
`content`, `media_type`, `byte_length` and `content_sha256`. Absolute paths,
traversal, encoded path tricks, links, scripts and unrelated repository files are
rejected. Retrieval never executes the returned content or grants authority to it.

`skill_catalog_overview` accepts `{"max_entries":24}` (1–24, default 24) and
returns a context summary within 4096 characters. Its final counts disclose
omitted entries. It covers this bundled collection; project/global session
discovery belongs to the separate available-skills command and hook.

Overview availability means readable, parsed metadata only. Setup, lifecycle,
host usability and activation remain unverified, and the selected route is
`unassessed` until a task is evaluated. Routing-entrypoint names are candidates,
not proof of package identity. JSON-quoted entrypoint locators are relative to
this installed collection; use `skill_resource_read` for actual content. See
[routing guidance](https://github.com/i-9-ai/skills/wiki/Host-Hooks#availability-and-routing-guidance) for route
choices and locator limits.

All three tools reject unknown fields and incorrect types. The same operations
are available without MCP and return JSON:

```sh
node bin/index.mjs catalog search --query authoring --limit 10
node bin/index.mjs catalog read --skill skill-authoring
node bin/index.mjs catalog read --skill skill-authoring --resource references/tooling.md
node bin/index.mjs catalog overview --max-entries 12
```

## Installed identity and provenance

Catalog operations resolve package resources from the running installed module,
not cwd, `I9_SKILLS_PROJECT_ROOT` or global skills. The existing catalog validator
checks the declared collection and package identity and refuses stale metadata.
Keep the installed collection stable while reading; checks do not promise
confinement against hostile concurrent filesystem mutation.

Each result carries `provenance`: logical collection, package name/version,
repository, catalog SHA-256 and separate `source_ref` and `resolved_git_sha` fields.
An explicit clean Git build can retain these fields in a bounded build receipt.
Runtime `source_provenance` reports that revision as `asserted`, separately from
the recorded `build_verification` and verified installed-file integrity. The
receipt is unsigned: it cannot authenticate a coherently rewritten artifact.
Missing, altered, archive-built or dirty-source receipts return `null` source
fields and an explicit evidence gap. Runtime reads never inspect the caller's
Git checkout. A version or content digest is not a resolved source SHA.
Resource responses additionally hash their returned bytes.
These digests describe content consistency; they are not signatures or legal,
behavioral or publication approval.

## Report a read

Call `skill_read_record` with:

```json
{
  "event_id": "read-001",
  "collection": "demo",
  "skill": "skill-authoring",
  "revision": "sha256:content-digest",
  "session": "random-session-token",
  "occurred_at": "2026-09-15T12:00:00.000Z"
}
```

Use opaque random session tokens, never user identities or task names. Identifiers accept only bounded ASCII letters, numbers, dots, colons, underscores and hyphens. Reject additional fields. The emitter supplies evidence and timestamps; the server cannot authenticate whether the read occurred. A retry with changed evidence fails.

Call `skill_read_rankings` with optional canonical UTC `from`, exclusive `until`, and `limit` (1–100, default 20). Each row contains collection, skill, read count and distinct session count. Results aggregate revisions; revision remains stored per event. These are demand signals, not importance or quality proofs.

## Explicit lifecycle and catalog observations

Six additional tools share the closed schema-2 contracts in the
[lifecycle guide](https://github.com/i-9-ai/skills/wiki/Lifecycle-Evidence): `skill_lifecycle_record`,
`skill_catalog_observe`, `skill_lifecycle_metrics`, `skill_routing_overlap`,
`skill_catalog_inactivity` and `skill_catalog_history`. Records receive complete
event objects; queries receive an explicit half-open UTC period and optional
collection/skill filters. Tool listing describes each schema and its write/read
annotation. No tool receives a database or filesystem path as an argument.

Lifecycle ratios return denominators; absent catalog coverage is an error, not
proof of inactivity. Catalog observation is a complete caller-reported inventory,
distinct from reading this installed collection's metadata. Reads, hooks and
catalog retrieval never manufacture lifecycle outcomes. The guide includes
complete event examples, retries, reason codes, query budgets and history paging.

## Change reports and onboarding

`skill_bump_report` compares two caller-supplied pinned observations and an explicit
assessment; `skill_onboarding` returns a versioned inert guide with complete
synthetic examples. Both work without data storage. See
[skill change reports](https://github.com/i-9-ai/skills/wiki/Skill-Change-Reports) for observation production,
review evidence, classification and the runnable installed walkthrough. Reports
do not rerun submitted validation, infer compatibility from hashes, change versions
or execute the guide. Requests are limited to 768 KiB; report output to 480 KiB
before the MCP envelope and guide output to 64 KiB.

## Storage and limits

On the first explicit record, ordered checksum-verified migrations run in SQLite transactions. Inserts use `BEGIN IMMEDIATE` and a five-second busy timeout, preserving events from cooperating processes. No database replacement, history pruning, remote telemetry or prompt storage occurs. Database failures require operator diagnosis; there is no reset fallback. Use a stable, trusted local directory; path inspection does not promise race-proof filesystem confinement. A new database has mode 0600; pre-existing modes remain caller-owned. The [typed telemetry CLI](https://github.com/i-9-ai/skills/wiki/Skill-Telemetry) shares this evidence store and adds explicit session/attempt events and trends.

**Use a dedicated evidence database.** Aggregate catalog helpers replace derived
database files and refuse this evidence store, including reset/rebuild requests.
Catalog or unrelated databases are rejected, untouched. Migration 3 preserves
older read events; queries against an older known schema request an explicit
upgrade instead of performing one. Keep a backup before an explicit write upgrades
storage. There is no shared transactional writer for derived catalog databases.

The adapter implements newline-delimited JSON-RPC stdio initialization, ping,
tool discovery and calls. Input messages are bounded to 1 MiB and serialized
responses to 1 MiB. String request IDs are limited to 1 KiB in their serialized
JSON form (including escapes); numeric IDs must be safe integers. Invalid IDs
return an invalid-request error with a null ID before any operation runs.
Oversized tool output produces a bounded error and the server
can process a later valid request. Errors contain categories, not host paths,
raw requests or documents. Individual lifecycle events are at most 8 KiB and
catalog observations at most 256 KiB. No HTTP, MCP resource protocol, subscriptions
or activation inference is implemented; Markdown retrieval is an explicit tool.

Tool failures set `isError` and include `structuredContent.error` with `code` and
a fixed message: `invalid_input`, `catalog_unavailable`, `resource_unavailable`,
`storage_unavailable`, `response_too_large`, `unknown_tool`, `evidence_conflict`,
`schema_upgrade_required`, `query_limit_exceeded` or `catalog_unobserved`. Correct input or
repair the selected local installation/state, then retry; the server never
downloads missing files or resets evidence as a recovery shortcut.

Each line uses the bundled duplicate-aware JSON parser: invalid UTF-8, repeated
object keys and nesting beyond 64 levels fail before a storage operation. A
response finishes writing before the next request runs; a client that stops
reading stdout therefore pauses processing instead of accumulating responses.
Closing or failing the output closes storage and terminates the transport.
Input failure or premature close also cancels a pending response and discards
buffered requests. On POSIX, the default server owns its stdout pipe for the
server lifetime: orderly input completion finishes valid responses before closing
that pipe, and cancellation destroys a stalled write so the process can exit.
No other code should write protocol stdout during that lifetime. Files, terminals
and Windows keep Node's usual output semantics; a synchronous OS write cannot be
interrupted while it blocks the event loop, so an unread Windows pipe has no
bounded cancellation guarantee. Injected streams must honor Node's writable
destruction contract. Neither transport shutdown nor cancellation deletes the
database.
The root plugin includes this parser in the canonical authoring package; no
external parser or package installation is needed to start its MCP entrypoint.

Protocol sources: [MCP stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) and [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), consulted September 15, 2026. The adapter is original code, not vendored upstream implementation.
