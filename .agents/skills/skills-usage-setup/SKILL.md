---
name: skills-usage-setup
description: Use to preview, explicitly enable, inspect, or remove optional skill-read observations for selected skill collections while preserving unrelated host settings and local evidence.
license: Apache-2.0
compatibility: The bundled reference helper requires Node.js 24+ and an owned stable POSIX filesystem; unsupported native hosts retain a manual metadata-only fallback.
metadata:
  author: i-9-ai
  tags: 'skills, observations, setup'
  source: original
  source_url: 'https://github.com/i-9-ai/skills'
  setup: scripts/usage_setup.mjs
---

# Skills Usage Setup

## One outcome and boundary

Produce one inspected optional skill-read registration and its local ownership
receipt, enabled or deliberately removed. Use this when a caller wants to set up,
check or remove observations for explicitly selected skill collections. Status
and exact-owned removal are the lifecycle of that same registration.

Do not use this to rank skills, judge effectiveness, infer task outcomes, install
skills, publish evidence, or configure general application telemetry. A read
attempt is not a completed read; a completed read is not proof of activation,
correct use or success. Discovery works without observations.

## Inputs and decisions

Select an existing settings parent, explicit collection labels and canonical
roots, local evidence filename, retained runtime and supported native host.
Resolve this package from its loaded entrypoint; choose state and retained
observer files outside the installed package and discovery roots. Keep settings
and evidence outside both the installed package and retained observer directory. Do not search
a home directory or select every available collection implicitly.

Automatic registration accepts a **closed metadata-observer descriptor**:
host, this running Node executable and SHA-256, a read-only retained copy of the
bundled helper and SHA-256, selected collection roots and local sink. The helper
derives native commands itself. It rejects caller commands, argument arrays,
unrelated binaries or scripts, linked/shared-writable assets, writable observer
scripts and changed runtime bytes before a settings write. Hashes bind reviewed
content; they do not authenticate the caller, authorize automatic execution or
grant native host trust.

The self-contained helper supports native Read events for Claude, read_file
events for Gemini and CLI view events for Copilot. It does not parse Codex shell
commands. For that separate toolkit adapter, or version-sensitive native
contracts, read [native adapters](references/native-adapters.md). Unsupported
operations remain coverage gaps; never infer success from a generic after-event.

Confirm authority for the selected settings and automatic metadata collection.
Existing authorization persists; preview is not a new mandatory approval
ceremony. Keep the host's trust, approval and sandbox controls intact. Never
download, compile, install, upload evidence or bypass permissions in a hook.
Disclose labels, timestamps, opaque sessions, event IDs, local sink and retention:
records remain until separately removed; disabling preserves historical
evidence. No external recipient is configured.

## Procedure

1. Inspect selected settings and observers read-only. Avoid duplicated
   plugin/project observers. Keep recovery material outside discovery roots.
2. Describe exact read coverage, successful result fields, opaque session
   identity and excluded operations. Attempts and confirmed reads stay separate.
3. Deliberately retain the reviewed self-contained helper under a stable local
   observer directory, with no write bits. Create the closed descriptor below;
   no registration JSON may supply shell text or executable providers.
4. Preview descriptor and derived native entries. Inspect runtime paths/hashes,
   source roots, sink, settings, receipt and exact commands. Apply within existing
   authority using the identical reviewed digest and explicit write intent.
   Preserve unrelated entries; refuse matching unowned registrations.
5. Inspect status and perform one synthetic supported read. Verify expected
   metadata without prompts, bodies, commands, credentials or local paths.
   A settings file or receipt alone does not establish real host execution.
6. Preview removal; remove only exact receipt-matched entries. Changed, missing
   or duplicated ownership requires manual reconciliation. Preserve evidence
   and the inactive receipt. Legacy exact-owned removal remains supported,
   but old availability inventories do not establish bound runtime identity.

## Complete local example

Requires existing Node 24+ and a new caller-owned demonstration directory.
Set PACKAGE to this installed skill. The selected native settings below are
synthetic fixtures; creating them does not configure an installed host.

~~~sh
export PACKAGE="/absolute/installed/skills-usage-setup"
export WORKSPACE="$PWD/skill-read-demo"
mkdir "$WORKSPACE"

node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const workspace = fs.realpathSync(process.env.WORKSPACE);
const helper = path.join(fs.realpathSync(process.env.PACKAGE), 'scripts', 'usage_setup.mjs');
const { createObserverDescriptor } = await import(pathToFileURL(helper).href);
const collection = path.join(workspace, 'skills');
fs.mkdirSync(path.join(collection, 'example-skill'), { recursive: true });
fs.writeFileSync(path.join(collection, 'example-skill', 'SKILL.md'), '# Synthetic skill\n');

const retained = path.join(workspace, 'observer', 'scripts', 'usage_setup.mjs');
fs.mkdirSync(path.dirname(retained), { recursive: true });
fs.copyFileSync(helper, retained, fs.constants.COPYFILE_EXCL);
fs.chmodSync(retained, 0o444);

fs.writeFileSync(path.join(workspace, 'settings.json'), JSON.stringify({ theme: 'retain' }));
const descriptor = createObserverDescriptor({
    host: 'claude',
    script: retained,
    collections: { demo: collection },
    store: path.join(workspace, 'reads.jsonl'),
});
fs.writeFileSync(path.join(workspace, 'registration.json'), JSON.stringify(descriptor, null, 2));
NODE

node "$PACKAGE/scripts/usage_setup.mjs" enable \
  --file "$WORKSPACE/settings.json" \
  --registration "$WORKSPACE/registration.json" > "$WORKSPACE/preview.json"
cat "$WORKSPACE/preview.json"
~~~

The descriptor contains only this closed schema; values are deliberately selected
local paths or measured hashes:

~~~json
{
  "schema_version": 1,
  "kind": "skill-metadata-observer",
  "host": "claude",
  "runtime": {
    "executable": "/absolute/selected/node",
    "executable_sha256": "<64 lowercase hex characters>",
    "script": "/absolute/caller/observer/scripts/usage_setup.mjs",
    "script_sha256": "<64 lowercase hex characters>"
  },
  "collections": { "demo": "/absolute/caller/skills" },
  "store": "/absolute/caller/reads.jsonl"
}
~~~

Inspect preview.observer_descriptor and preview.registration. The latter
contains derived native event commands; it is output, never arbitrary writable
input. Do not apply until the exact automatic observer is understood and
authorized. Preview creates no settings, receipt, locks or evidence; this
example explicitly saves its private summary.

~~~sh
REVIEWED_REGISTRATION="$(node --input-type=module -e 'import fs from "node:fs"; console.log(JSON.parse(fs.readFileSync(process.env.WORKSPACE + "/preview.json", "utf8")).registration_digest)')"

node "$PACKAGE/scripts/usage_setup.mjs" enable \
  --file "$WORKSPACE/settings.json" \
  --registration "$WORKSPACE/registration.json" \
  --write --reviewed-registration "$REVIEWED_REGISTRATION"

node "$PACKAGE/scripts/usage_setup.mjs" status --file "$WORKSPACE/settings.json"
~~~

Enablement preserves theme and unrelated hooks. The sibling receipt records
exact owned entries, descriptor and digests. Repeating the same reviewed request
changes nothing. A script or Node upgrade requires new review and deliberate
reconfiguration.

Exercise the retained observer with a synthetic native successful read:

~~~sh
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const workspace = fs.realpathSync(process.env.WORKSPACE);
const descriptor = JSON.parse(fs.readFileSync(path.join(workspace, 'registration.json'), 'utf8'));
const result = spawnSync(descriptor.runtime.executable, [
    descriptor.runtime.script, 'observe-host', '--file', path.join(workspace, 'settings.json'),
], {
    encoding: 'utf8',
    input: JSON.stringify({
        hook_event_name: 'PostToolUse',
        session_id: 'synthetic-session',
        tool_name: 'Read',
        tool_input: { file_path: path.join(workspace, 'skills', 'example-skill', 'SKILL.md') },
        tool_response: { content: 'Synthetic result: never retained.' },
    }),
});
if (result.status !== 0) throw new Error('Synthetic observer failed.');
const observed = JSON.parse(fs.readFileSync(descriptor.store, 'utf8').trim());
if (observed.skill !== 'example-skill' || observed.kind !== 'read_confirmed' ||
    Object.hasOwn(observed, 'content')) throw new Error('Unexpected metadata.');
NODE

node "$PACKAGE/scripts/usage_setup.mjs" disable --file "$WORKSPACE/settings.json"
node "$PACKAGE/scripts/usage_setup.mjs" disable --file "$WORKSPACE/settings.json" --write
node "$PACKAGE/scripts/usage_setup.mjs" status --file "$WORKSPACE/settings.json"
~~~

Verify theme remains, owned hooks disappear, status is disabled and reads.jsonl
retains the record. This validates fixture wiring, not a live host. Native trust
and actual delivery require separately authorized provider testing.

## Prerequisites and setup

Use Node.js 24+ on an owned stable POSIX filesystem. Select existing canonical
state parents and deliberately retain the reviewed observer outside discovery
roots. The complete example above uses synthetic settings; actual host
configuration needs authority for those settings and the disclosed metadata.

### Explicit setup

scripts/usage_setup.mjs is the complete zero-dependency implementation. Its
enable, status, disable and observe commands are noninteractive; --help shows
the interface. Setup defaults to preview; enable --write requires the exact
reviewed-registration digest, including runtime identity. CLI failures return 1
with fixed diagnostics that do not echo inputs. observe and observe-host fail
without blocking the original operation; native output is neutral. Inspect the
sink for evidence rather than treating exit 0 as successful capture.

### Idempotence and side effects

The sink's five inputs are collection and skill slugs, kind (read_attempt or
read_confirmed), an opaque 64-hex session_key and canonical UTC observed_at.
It adds event_id and schema_version. JSONL appends are local, bounded and retain
existing bytes. Unknown payload fields are refused. Native input is transient;
only this metadata persists. The observer never reads skill bodies itself.
There is no deduplication, ranking, upload or proof of effectiveness. Do not
derive identities from prompts or personal information.

Settings are capped at 128 KiB, host input at 16 KiB and evidence at 4 MiB. Runtime
hashing is bounded at 160 MiB for Node and 128 KiB for the standalone script.
Only existing canonical parents and regular unlinked files qualify. The retained
script is read-only, byte-identical to this bundled reference and checked again
before enablement. Its native observer rechecks receipt-bound runtime identity
on invocation. Node may remain owner-updatable, but shared write permissions
are refused and changed bytes invalidate the descriptor. These measures assume
stable caller-owned directories; they are not a sandbox against malicious
replacement or a crash-proof two-file transaction.

Occupied cooperating locks remain. Settings/receipt failures attempt rollback
without overwriting another writer. Missing runtime, changed script, unsupported
read proof or full storage is a coverage gap; retain evidence and reconcile
explicitly. Exact-owned removal still works after runtime or collections
disappear. Disabling never deletes observer scripts, changes permission controls,
migrates evidence or alters retention.

### Fallback

Arbitrary host command JSON can be previewed as a manual configuration reference;
enable --write is refused, even with a digest. Custom executable providers are
not accepted by automatic setup. Existing generic receipts remain inspectable
and exactly removable. Read [implementation wiring](references/implementation.md)
for the complete schema, manual route and legacy boundaries.

Without a supported host or trusted runtime, use explicit controlled read
metadata with observe, or keep automatic observation unavailable. Discovery,
installation and activation never run this setup entrypoint. A separately
selected toolkit retains its SQLite/native adapter capability; verify its actual
identity, local dependencies and read-only retained runtime instead of trusting
a mutable cache or sibling package.

For source and redistribution decisions, read the
[research and reuse record](references/provenance.md).
