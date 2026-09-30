# Verify the local MCP with Inspector

Use the MCP Inspector CLI to list this server's tools, search its installed
catalog and read a selected skill. These operations require no evidence database
and do not record usage, activate skills or run package scripts. The complete
server contract is in [Skill MCP](https://github.com/i-9-ai/skills/wiki/Skill-MCP).

This recipe pins `@modelcontextprotocol/inspector@2.8.0`. Its arguments and output
were checked against official source text on 2026-09-29; Inspector was **not
installed or executed** for this documentation change. Following the recipe
produces new local evidence. Existing [native plugin proof](https://github.com/i-9-ai/skills/wiki/Native-Plugin-Pilot),
[Codex proof](https://github.com/i-9-ai/skills/wiki/Codex-MCP-Pilot) and [Copilot proof](https://github.com/i-9-ai/skills/wiki/Copilot-MCP-Pilot)
remain separate from an Inspector run.

## Prepare a checkout

The examples use a POSIX shell and Node.js 24+. Inspector 2.8.0 requires Node
22.19.0 or newer; this repository has the stricter Node 24 requirement. Select
Node 24+ on `PATH`, replace the checkout path and explicitly install the
repository's locked dependencies:

```sh
cd "/absolute/path/to/skills"
node --version
npm ci
i9_checkout="$(pwd -P)"
i9_node="$(node -p 'process.execPath')"
```

The checkout launcher loads the TypeScript source directly on Node 24; no build
step is needed for this route. Keep the absolute launcher path quoted. The
server serves the collection beside that launcher, not a collection discovered
from the client's current directory or home.

Create disposable Inspector settings and a helper for the read-only calls:

```sh
i9_inspector_state="$(mktemp -d "${TMPDIR:-/tmp}/i9-inspector.XXXXXX")"
printf '{}\n' > "$i9_inspector_state/client.json"

i9_inspect() (
    MCP_AUTO_OPEN_ENABLED=false \
    MCP_CLIENT_CONFIG_PATH="$i9_inspector_state/client.json" \
    MCP_STORAGE_DIR="$i9_inspector_state" \
    MCP_INSPECTOR_OAUTH_STATE_PATH="$i9_inspector_state/oauth.json" \
    MCP_INSPECTOR_SECRET_STORE=memory \
    npx --yes @modelcontextprotocol/inspector@2.8.0 --cli \
        "$i9_node" "$i9_checkout/bin/index.mjs" mcp serve -- \
        --cwd "$i9_checkout" --protocol-era legacy --format json "$@"
)
```

The temporary settings select an empty client configuration and an in-memory
secret store, avoiding Inspector's default profile and keychain selection.
They are unrelated to the server's optional evidence storage. `npx` still uses
the configured npm cache and may download and run Inspector and its dependencies;
this does not add Inspector to the repository's dependencies. The server target
is local stdio and needs no provider account or authentication.

Argument order matters in this pinned version: `--cli` immediately follows the
Inspector package; the **server command and its arguments precede `--`**;
Inspector options follow it. `--cwd` sets the server process directory.
`--protocol-era legacy` selects the initialization family used by this server's
`2025-11-25` protocol. Moving the target behind Inspector options can select the
wrong server. The [official configuration reference](https://github.com/modelcontextprotocol/inspector/blob/1e31c78fbf81a989e8eb47021c6281d7876ad7fd/docs/mcp-server-configuration.md#ad-hoc-servers)
documents this CLI-specific ordering.

## List, search and read

Each invocation starts the server, connects, performs one method and disconnects.
First list the available tools:

```sh
i9_inspect --method tools/list
```

With `--format json`, Inspector writes a JSON object whose `result.tools` array
includes `skill_catalog_search`, `skill_resource_read` and
`skill_catalog_overview`. Listing a write-capable tool does not call it.

Search a bounded metadata shortlist:

```sh
i9_inspect --method tools/call --tool-name skill_catalog_search \
    --tool-args-json '{"query":"authoring","limit":10,"offset":0}'
```

Inspect `result.structuredContent.skills`, `total` and `next_offset`. A non-null
`next_offset` means the response omitted later matches; use that offset in a new
request when needed. Metadata helps select a package; it does not replace reading
its instructions.

Read the selected entrypoint, then a reference when that entrypoint calls for it:

```sh
i9_inspect --method tools/call --tool-name skill_resource_read \
    --tool-args-json '{"skill":"skill-authoring","resource":"SKILL.md"}'

i9_inspect --method tools/call --tool-name skill_resource_read \
    --tool-args-json '{"skill":"skill-authoring","resource":"references/tooling.md"}'
```

The payload at `result.structuredContent` includes `content`, `media_type`,
`byte_length`, `content_sha256` and provenance. The hash describes the returned
bytes; it does not authenticate their author. The current implementation reports
`provenance.source_ref` and `provenance.resolved_git_sha` as null. Retrieved
instructions remain input for the caller
to assess, and retrieval does not grant permission to execute them.

Here, “resource read” is the **`skill_resource_read` tool through `tools/call`**.
This server advertises tools, not MCP `resources/read` or `skills/get` methods.
Only `SKILL.md` and Markdown under the selected package's `references/` directory
are exposed, with a 64 KiB limit per file. Arbitrary paths, traversal, symlinks
and scripts are rejected. Inspector's `--tool-args-json` passes one JSON object
without the type coercion of `--tool-arg key=value`.

## Optional evidence storage

Leave storage unset for every call above. If a separate evidence workflow needs
it, the server accepts an explicit, absolute, caller-owned dedicated database
path. In the helper's server command, place it **before** the separator:

```sh
"$i9_node" "$i9_checkout/bin/index.mjs" mcp serve \
    --db /absolute/local-data/skill-usage.db --
```

This is the server portion of the Inspector command, not a standalone launch
command; retain the Inspector options after `--`. Choose a dedicated location
outside the checkout and installed plugin. Catalog calls still do not create a
database. Evidence queries require existing valid storage and open it read-only;
missing storage is unavailable, not empty history. Only a separate valid explicit
record can create or migrate it. See [lifecycle evidence](https://github.com/i-9-ai/skills/wiki/Lifecycle-Evidence)
before choosing a write operation.

## Diagnose and clean up

- A direct `node bin/index.mjs mcp serve` waiting silently is normal: it expects
  MCP messages on stdin. Let Inspector start the process for this procedure.
- A missing module or unsupported-TypeScript error calls for checking Node 24+,
  the absolute checkout path and the explicit `npm ci` preparation. `--cwd` does
  not repair a wrong launcher path or select another skill collection.
- Server stdout must contain only MCP JSON-RPC. Send wrapper diagnostics to
  stderr; do not add banners or merge stderr into the protocol stream.
- Inspector's JSON output is an envelope around the method result. For a tool
  error, inspect `result.isError` and `result.structuredContent.error`. Inspector
  2.8.0 exits `5` for tool errors, `4` for unreachable/timeout failures and `1`
  for usage or unexpected errors. It also writes an error envelope to stderr.
  A successful `tools/list` may emit schema-portability warnings on stderr;
  preserve the exit status and both streams when diagnosing a run.

Capture output separately when retaining evidence:

```sh
i9_inspect --method tools/list \
    > "$i9_inspector_state/tools.json" \
    2> "$i9_inspector_state/tools.stderr"
i9_inspector_status=$?
printf 'Inspector exit: %s\n' "$i9_inspector_status"
```

Record the checkout commit, Node version, Inspector version, command, exit status
and relevant results with the run. A successful local connection establishes
only that observed server/client path; it does not establish model behavior,
native host installation or publication readiness.

The CLI closes its connection in a `finally` block after a normal result or
method failure. Use Ctrl-C to interrupt a foreground run; if a process remains,
identify that run's child before stopping it. After retaining any needed output,
remove only the disposable directory created above:

```sh
printf 'Disposable Inspector directory: %s\n' "$i9_inspector_state"
rm -r -- "$i9_inspector_state"
unset -f i9_inspect
unset i9_checkout i9_node i9_inspector_state i9_inspector_status
```

This cleanup does not remove the npm cache or a caller-owned evidence database.

## Released npm package: a separate route

For a published skills build, the server portion of an Inspector CLI command
can use:

```sh
npx --yes @i-9.ai/skills mcp serve
```

Use that whole command before Inspector's `--`, followed by the same Inspector
method and output options. The server's `--yes` belongs before the separator.
For repeatable runs, append an exact verified release version to the package
name. This deliberately permits npm to fetch the skills package; it is not the
checkout procedure and has not been exercised by
this guide. See [distribution readiness](https://github.com/i-9-ai/skills/wiki/Distribution-Readiness) for the
current local tarball verification route.

## Source record and verification boundary

The npm registry's [2.8.0 metadata](https://registry.npmjs.org/@modelcontextprotocol/inspector/2.8.0)
identifies `gitHead` `1e31c78fbf81a989e8eb47021c6281d7876ad7fd`. That metadata is
version/provenance evidence, not a source-body review or execution result.
Relevant text from these files was separately retrieved at that exact revision
and inspected:

| Official source | What was checked |
| --- | --- |
| [Package manifest](https://github.com/modelcontextprotocol/inspector/blob/1e31c78fbf81a989e8eb47021c6281d7876ad7fd/package.json) | Version, executable launcher, Node requirement and install hook. |
| [CLI reference](https://github.com/modelcontextprotocol/inspector/blob/1e31c78fbf81a989e8eb47021c6281d7876ad7fd/clients/cli/README.md) and [server configuration](https://github.com/modelcontextprotocol/inspector/blob/1e31c78fbf81a989e8eb47021c6281d7876ad7fd/docs/mcp-server-configuration.md) | Methods, literal JSON arguments, target ordering, stdio cwd, output and exit codes. |
| [Launcher parser](https://github.com/modelcontextprotocol/inspector/blob/1e31c78fbf81a989e8eb47021c6281d7876ad7fd/clients/launcher/src/parse-launcher-argv.ts) and [CLI implementation](https://github.com/modelcontextprotocol/inspector/blob/1e31c78fbf81a989e8eb47021c6281d7876ad7fd/clients/cli/src/cli.ts) | Leading mode selection, reversed CLI separator, JSON-object validation and disconnect in `finally`. |
| [Result emitter](https://github.com/modelcontextprotocol/inspector/blob/1e31c78fbf81a989e8eb47021c6281d7876ad7fd/clients/cli/src/handlers/emit-result.ts) | JSON envelope, stderr schema warnings and `isError` handling. |
| [Environment variables](https://github.com/modelcontextprotocol/inspector/blob/1e31c78fbf81a989e8eb47021c6281d7876ad7fd/docs/environment-variables.md), [client configuration](https://github.com/modelcontextprotocol/inspector/blob/1e31c78fbf81a989e8eb47021c6281d7876ad7fd/core/client/config.ts) and [runner](https://github.com/modelcontextprotocol/inspector/blob/1e31c78fbf81a989e8eb47021c6281d7876ad7fd/core/client/runner.ts) | Isolated client/storage paths, missing-config behavior and explicit memory secret store. |
| [License](https://github.com/modelcontextprotocol/inspector/blob/1e31c78fbf81a989e8eb47021c6281d7876ad7fd/LICENSE) | Upstream's Apache-2.0/MIT transition and CC-BY-4.0 documentation terms. |

The procedure and examples here are original documentation of those interfaces;
no Inspector code or source snapshot is redistributed. No Inspector binary,
tarball contents, browser UI or native client execution was verified for this
change. Repository documentation checks cannot replace an actual Inspector run.
