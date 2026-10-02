# Optional native adapters

Load this only when the caller selects a native host or a separately reviewed
collection toolkit. Core registration, local JSONL and exact-owned removal do
not require that toolkit.

Native hooks run with host/user authority. Confirm installed version, settings
location, trust, successful result fields and duplicate observers before
registration. Preserve native approval and sandbox controls. Primary hook
references were inspected on 2026-10-02; fixtures are not real host delivery.

| Route | Selected read proof | Boundaries |
| --- | --- | --- |
| Portable Claude | PreToolUse/Read attempt; PostToolUse/Read with result | Native direct Read entrypoints only; no aliased paths |
| Portable Gemini | BeforeTool/read_file; successful AfterTool llmContent | Error or missing content remains a gap; no call pairing |
| Portable Copilot CLI | preToolUse/view; postToolUse success and text result | SessionId required; SDK schemas are separate |
| Toolkit Codex | Constrained Bash entrypoint read and matching successful result | Toolkit-specific parser; absent proof is not confirmation |

Official references: [Claude](https://code.claude.com/docs/en/hooks),
[Gemini](https://geminicli.com/docs/hooks/reference/),
[Copilot CLI](https://docs.github.com/en/copilot/reference/hooks-reference),
[Copilot SDK](https://docs.github.com/en/copilot/how-tos/copilot-sdk/hooks/post-tool-use)
and [Codex](https://learn.chatgpt.com/docs/hooks). These references do not
authorize settings changes or establish installed host coverage.

## Portable closed observer

The entrypoint's complete example creates a retained read-only helper and
descriptor, then derives native registration through bundled adapters. Only
Claude, Gemini and Copilot CLI are supported there. Codex Bash is deliberately
excluded from this portable fallback; do not invent a success parser.

The generated command is a POSIX-quoted absolute Node executable followed by
the retained helper, observe-host and --file with the selected settings.
Copilot gets a closed --event selector. Host syntax, matchers and timeouts are
derived; callers cannot replace commands or add shell fragments.
Native stdout stays neutral and errors do not block the original operation.
Selected records stay local and never contain raw host input.

## Optional collection toolkit and SQLite

The separately selected @i-9.ai/skills toolkit retains the richer SQLite/native
adapter path for Codex, Claude, Copilot and Gemini. Verify actual package identity,
installed version and help rather than inferring the new interface from a
same-named package. Older published versions may lack reviewed-registration and
retained-runtime checks; those versions are not equivalent to this implementation.

An ordinary checkout, owner-writable npm installation, npx cache or hoisted
dependency tree is unsuitable for automatic registration. Deliberately retain
the reviewed package and local production dependencies first. A reviewed
tarball extraction followed by an explicit npm install --omit=dev --ignore-scripts
in that root is a preparation option, outside hook execution. Remove write bits
from retained package files only after inspection. Never alter an unrelated
installation's modes or install during an event.

The toolkit requires the exact local bin/index.mjs and this running Node;
arbitrary installed CLI executables are refused. Its inventory covers package
identity, source/compiled code, bundled helpers and local dependencies, rejecting
links and any writable toolkit file or directory. The declared production
dependency closure, including required peers, resolves relative to each importer
inside the retained inventory. A truly absent optional dependency or optional
peer is allowed; a present package outside that tree is refused. Type-only
packages and import-only exports may lack a CommonJS entry but still require a
local inventoried manifest. Traversal is limited to 256 packages, 2,048 declared
relations, depth 64 and 128 KiB per manifest; cycles are deduplicated by path.
No dependency module is evaluated during inspection. npm .bin aliases are
excluded and not executed. Computed or undeclared imports require separate code
review; manifest closure is not a runtime sandbox.
Node itself remains byte-bound and cannot be shared-writable; an owner may still
upgrade it. These checks assume stable owned filesystems, not malicious race
confinement.

For an already prepared, reviewed runtime with this interface:

~~~sh
node "$TOOLKIT_RUNTIME/bin/index.mjs" hook telemetry-enable \
  --host claude --file "$SETTINGS_FILE" \
  --collection "project=$COLLECTION_ROOT" > "$PREVIEW_FILE"

REVIEWED_REGISTRATION="$(node --input-type=module -e 'import fs from "node:fs"; console.log(JSON.parse(fs.readFileSync(process.env.PREVIEW_FILE, "utf8")).registration_digest)')"

node "$TOOLKIT_RUNTIME/bin/index.mjs" hook telemetry-enable \
  --host claude --file "$SETTINGS_FILE" \
  --collection "project=$COLLECTION_ROOT" \
  --write --reviewed-registration "$REVIEWED_REGISTRATION"

node "$TOOLKIT_RUNTIME/bin/index.mjs" hook telemetry-status \
  --host claude --file "$SETTINGS_FILE"

node "$TOOLKIT_RUNTIME/bin/index.mjs" hook telemetry-disable \
  --host claude --file "$SETTINGS_FILE" --write
~~~

Variables select caller-owned absolute paths; PREVIEW_FILE must be exported for
the example's Node read. Inspect the complete preview before applying existing
authority. Repeat --collection only for another deliberate source; --db selects
an explicit SQLite file, otherwise the toolkit's declared shared agent-state
default applies. Generic JSONL and toolkit SQLite receipts are separate.

The preview exposes registration_digest and runtime_identity with executable,
launcher and a bounded inventory SHA-256/file count/byte count. Reviewed digest
is required on every explicit enable write, including idempotent requests.
Import or dependency changes invalidate it before settings writes. Status
rehashes the existing inventory without opening the evidence database.
Toolkit runtime binding is verified at setup/status; it does not promise
per-event inventory checks or hostile-filesystem confinement.

For a changed runtime, database or selected collection, inspect status and
exactly disable the old receipt, retain/review the new runtime, then preview
and explicitly enable it. Do not adopt unowned matches or overwrite drift.
Receipt suffix is .i9-skills.json; the portable reference uses
.skills-usage.json. Never exchange them. Legacy toolkit receipts remain
inspectable/removable with a legacy_runtime_unbound coverage warning.

No npx download, compilation, implicit update, permission bypass or evidence
upload occurs in registered hooks. If the retained runtime disappears, status
reports a gap and exact-owned removal remains available; deliberate recovery or
the complete portable fallback is separate.
