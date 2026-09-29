# Skill catalog and explicit read metrics

One local MCP exposes this installed collection's instructions and explicit
observed-read metrics. Catalog tools only read bundled files; they do not record
usage, activate skills, scan the caller's home or execute package scripts.
Recording a read requires a separate explicit call with evidence from its emitter.

## Start

Use Node.js 24+ and run `npm ci` explicitly in the checkout first. Configure a
stdio MCP client with command `node` and arguments pointing to `bin/index.mjs`,
`mcp`, and `serve`. Run from a checkout:

```sh
node bin/index.mjs mcp serve
# Optional caller-owned evidence storage, required only for usage operations:
node bin/index.mjs mcp serve --db /absolute/local-data/skill-usage.db
```

The [unified CLI](../bin/index.md) uses the same service and transport as the
Claude plugin's dependency-free `src/transport/PluginMcpServer.ts --host claude`.
That registration is named `i9-skills` in `mcp/claude.json`. The former `mcp usage`
route, usage-only class names and `i9-skill-usage` registration were replaced
before the first release; update manually copied client configurations.

Initialization, tool listing, search, resource reads and overview require no data
directory and create no database. Only an explicit valid record may initialize
the selected dedicated usage database. Rankings require existing valid storage
and open it read-only. Missing state is reported as unavailable, not empty history.
An explicit CLI `--db` selects a caller-owned absolute path; plugin state uses
the selected host's absolute persistent data directory outside both the installed
plugin and caller project. No automatic cwd/home fallback is used for storage.
Codex and Copilot do not register this MCP until their native loading and data
contracts have matching verification; they can use the explicit CLI configuration.

The npm package is not published yet. After an authorized publication, replace
`<released-version>` with the verified version in the client configuration:

```sh
npx --yes --package='@i-9-ai/skills@<released-version>' i9-skills mcp serve
```

This deliberately permits npm to obtain that pinned package; it is not an
installation step performed by a hook. For current development use the checkout
command above or the [local tarball test](Distribution%20Readiness.md). Never use
an unpinned `latest` package as an implicit hook dependency.

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
Clean package files do not independently prove a Git revision, so those fields
are `null` unless such evidence is available. A version or content digest is not
a resolved source SHA. Resource responses additionally hash their returned bytes.
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

## Storage and limits

On the first explicit record, ordered checksum-verified migrations run in SQLite transactions. Inserts use `BEGIN IMMEDIATE` and a five-second busy timeout, preserving events from cooperating processes. No database replacement, history pruning, remote telemetry or prompt storage occurs. Database failures require operator diagnosis; there is no reset fallback. Use a stable, trusted local directory; path inspection does not promise race-proof filesystem confinement. A new database has mode 0600; pre-existing modes remain caller-owned. The [typed telemetry CLI](Skill%20Telemetry.md) shares this evidence store and adds explicit session/attempt events and trends.

**Use a dedicated usage database for this delivery.** Existing catalog helpers replace database files and cannot safely run alongside this writer. Catalog or unrelated databases are rejected, untouched. Unifying the database requires a shared transactional catalog writer first.

The adapter implements newline-delimited JSON-RPC stdio initialization, ping,
tool discovery and calls. Input messages are bounded to 64 KiB and serialized
responses to 1 MiB. Oversized tool output produces a bounded error and the server
can process a later valid request. Errors contain categories, not host paths,
raw requests or documents. No HTTP, MCP resource protocol, subscriptions or
activation inference is implemented; Markdown retrieval is an explicit tool.

Tool failures set `isError` and include `structuredContent.error` with `code` and
a fixed message: `invalid_input`, `catalog_unavailable`, `resource_unavailable`,
`storage_unavailable`, `response_too_large` or `unknown_tool`. Correct input or
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
