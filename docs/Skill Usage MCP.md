# Explicit skill read metrics

This first local MCP records **observed reads**, not activation. Starting it does not observe filesystem operations. A host adapter must report a completed read explicitly; retry with the same event ID to avoid double counting. No hooks are installed.

## Start

Use Node.js 24+ and run `npm ci` explicitly in the checkout first. Create a caller-owned local data directory, then configure a stdio MCP client with command `node` and arguments pointing to `bin/index.mjs`, `mcp`, `usage`, `--db`, and an absolute database filename in that directory. Run directly from a checkout:

```sh
node bin/index.mjs mcp usage --db /absolute/local-data/skill-usage.db
```

The [unified CLI](../bin/index.md) composes the command, service, repository, migration and transport components. Use the complete checkout with its pinned dependencies or the explicitly built package. There is one CLI launcher; copying two old files is not a supported distribution. The Claude Code plugin manifest starts `src/transport/PluginUsageMcpServer.ts` directly with Node 24 and no package dependencies. That protocol entrypoint defaults to `skill-usage.db` in the host's absolute persistent `PLUGIN_DATA` or `CLAUDE_PLUGIN_DATA` directory. Codex and Copilot plugin manifests do not map it because their legacy MCP data-path contract remains unverified. If the host provides no data directory, startup fails without writing a database. The normal CLI also accepts this default when `--db` is omitted; otherwise provide an explicit absolute path. This is not yet a published NPX package or a native-host installation test. The [typed telemetry CLI](Skill%20Telemetry.md) shares this dedicated database and adds explicit session/attempt events and trends without changing the MCP request schema.

## Report a read

Call `skill_read_record` with:

```json
{
  "event_id": "read-001",
  "collection": "demo",
  "skill": "symfony-console",
  "revision": "sha256:content-digest",
  "session": "random-session-token",
  "occurred_at": "2026-09-15T12:00:00.000Z"
}
```

Use opaque random session tokens, never user identities or task names. Identifiers accept only bounded ASCII letters, numbers, dots, colons, underscores and hyphens. Reject additional fields. The emitter supplies evidence and timestamps; the server cannot authenticate whether the read occurred. A retry with changed evidence fails.

Call `skill_read_rankings` with optional canonical UTC `from`, exclusive `until`, and `limit` (1–100, default 20). Each row contains collection, skill, read count and distinct session count. Results aggregate revisions; revision remains stored per event. These are demand signals, not importance or quality proofs.

## Storage and limits

Ordered checksum-verified migrations run in SQLite transactions. Inserts use `BEGIN IMMEDIATE` and a five-second busy timeout, preserving events from cooperating processes. No database replacement, history pruning, remote telemetry or prompt storage occurs. Database failures require operator diagnosis; there is no reset fallback. Use a stable, trusted local directory; path inspection does not promise race-proof filesystem confinement. A new database has mode 0600; pre-existing modes remain caller-owned.

**Use a dedicated usage database for this delivery.** Existing catalog helpers replace database files and cannot safely run alongside this writer. Catalog or unrelated databases are rejected, untouched. Unifying the database requires a shared transactional catalog writer first.

The adapter implements newline-delimited JSON-RPC stdio initialization, ping, tool discovery and calls; input messages are bounded to 64 KiB. No HTTP, resources, subscriptions or activation inference is implemented. Test with `node --test tests/integration/cli/skill-usage-mcp.test.mjs`.

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
