---
name: skills-usage-setup
description: Use to preview, explicitly enable, inspect, or remove optional skill-read observations for selected skill collections while preserving unrelated host settings and local evidence.
license: Apache-2.0
compatibility: The bundled reference helper requires Node.js 24+ and an owned stable local filesystem; the manual procedure needs only JSON editing and trusted observation capabilities.
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
and removal are the lifecycle of that same registration.

Do not use this to rank skills, judge effectiveness, infer task outcomes, install
skills, publish evidence, or configure general application telemetry. A read
attempt is not a completed read; a completed read is not proof of activation,
correct use or success. Discovery works without observations.

## Inputs and decisions

Obtain the caller's selected settings file, collection labels and roots, local
evidence filename, existing runtime and intended observation source. Resolve this
package from the loaded entrypoint and choose outputs outside the installed
package and skill-discovery roots. Do not search a home directory or select every
available collection implicitly.

Use a trusted receipt-producing host adapter when its current contract is known.
Otherwise use an explicit metadata producer or keep setup disabled. Missing trust,
unsupported tool operations and unavailable runtime are coverage gaps. Do not
guess a provider's settings schema. Load [native adapters](references/native-adapters.md)
only for a supported native host or the optional collection toolkit integration.
The generic route below works without that toolkit.

Confirm authority for the selected settings before applying a change. Existing
authorization persists; a preview is not a new mandatory approval ceremony.
Keep prompts, file bodies, commands and credentials out of observations. Local
registration commands and paths remain private configuration, not public evidence.

## Procedure

1. Inspect the selected settings and existing observers read-only. Avoid duplicate
   plugin/project registrations for the same read source. Keep copies or receipts
   outside discovery roots.
2. Define the producer's exact coverage: which entrypoint reads it sees, the
   supported result proof, opaque session identity and excluded operations.
   Record attempts separately; mark confirmed only from an actual supported
   successful read receipt. Never interpret a generic after-event as success.
3. Supply registration JSON using the host's verified syntax. The bundled
   provider merges event arrays under a caller-selected JSON object path; it
   neither invents native hooks nor executes their commands. Inject a reviewed
   configuration provider through the module API for another schema.
4. Preview enablement, inspect the supplied registration and summary, then apply
   with explicit write intent. Preserve unrelated keys/entries. Record only owned
   entries, selected paths and a registration digest in the sibling receipt.
5. Inspect status and perform one synthetic source operation. Verify one expected
   metadata record and absence of payload fields. A generated registration or
   receipt alone does not prove native execution or trust.
6. To remove, preview and remove only exact receipt-matched entries. Refuse
   changed, duplicated or missing ownership; reconcile manually. Keep evidence
   and the inactive receipt. Never erase or migrate historical observations as
   part of setup.

## Minimal complete local example

Requires an existing Node 24+ runtime. Set `PACKAGE` to this installed package
and `WORKSPACE` to a new caller-owned demonstration directory. This synthetic
JSON hook schema is an inert example, not a native-host registration:

```sh
export PACKAGE="/absolute/installed/skills-usage-setup"
export WORKSPACE="$PWD/skill-read-demo"
mkdir "$WORKSPACE"
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
const workspace = fs.realpathSync(process.env.WORKSPACE);
const packagePath = fs.realpathSync(process.env.PACKAGE);
fs.mkdirSync(path.join(workspace, 'skills', 'example-skill'), { recursive: true });
fs.writeFileSync(path.join(workspace, 'skills', 'example-skill', 'SKILL.md'), '# Synthetic skill\n');
fs.writeFileSync(path.join(workspace, 'settings.json'), JSON.stringify({ theme: 'retain', hooks: { SkillRead: [{ command: 'retain-existing' }] } }));
fs.writeFileSync(path.join(workspace, 'registration.json'), JSON.stringify({
  provider: 'json-array-map', hook_path: ['hooks'],
  events: { SkillRead: [{ command: 'reviewed-metadata-producer' }] },
  runtime_files: [process.execPath],
  collections: { demo: path.join(workspace, 'skills') },
  store: path.join(workspace, 'reads.jsonl')
}, null, 2));
NODE
node "$PACKAGE/scripts/usage_setup.mjs" enable --file "$WORKSPACE/settings.json" --registration "$WORKSPACE/registration.json"
node "$PACKAGE/scripts/usage_setup.mjs" enable --file "$WORKSPACE/settings.json" --registration "$WORKSPACE/registration.json" --write
node "$PACKAGE/scripts/usage_setup.mjs" status --file "$WORKSPACE/settings.json"
```

The preview creates no settings, receipt, lock or evidence. Applying preserves
`theme` and the existing entry; repeating it changes nothing. Now connect a
complete generic producer: this controlled reader emits metadata only after its
synthetic entrypoint read succeeds, without forwarding the file body:

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const workspace = fs.realpathSync(process.env.WORKSPACE);
fs.readFileSync(path.join(workspace, 'skills', 'example-skill', 'SKILL.md'), 'utf8');
const event = {
  collection: 'demo', skill: 'example-skill', kind: 'read_confirmed',
  session_key: createHash('sha256').update('synthetic-session').digest('hex'),
  observed_at: new Date().toISOString()
};
const result = spawnSync(process.execPath, [
  path.join(process.env.PACKAGE, 'scripts', 'usage_setup.mjs'), 'observe',
  '--store', path.join(workspace, 'reads.jsonl'), '--write'
], { input: JSON.stringify(event), encoding: 'utf8' });
if (result.status !== 0 || !JSON.parse(result.stdout || '{}').recorded) {
  throw new Error('Synthetic coverage gap; no native-host claim.');
}
const recorded = JSON.parse(fs.readFileSync(path.join(workspace, 'reads.jsonl'), 'utf8').trim());
if (recorded.skill !== 'example-skill' || recorded.kind !== 'read_confirmed' ||
    Object.hasOwn(recorded, 'content')) throw new Error('Unexpected metadata record.');
NODE
node "$PACKAGE/scripts/usage_setup.mjs" disable --file "$WORKSPACE/settings.json"
node "$PACKAGE/scripts/usage_setup.mjs" disable --file "$WORKSPACE/settings.json" --write
node "$PACKAGE/scripts/usage_setup.mjs" status --file "$WORKSPACE/settings.json"
```

Verify that the original hook remains, status is disabled, and `reads.jsonl`
still contains the observation. The example exercises managed configuration and
the local sink; replace the inert registration with a verified adapter before
claiming automatic host capture.

## Prerequisites and setup

### Explicit setup

`scripts/usage_setup.mjs` is the complete zero-dependency reference
implementation. `enable`, `status`, `disable` and `observe` are
noninteractive; `--help` prints their interface. Setup defaults to preview;
status never writes. `observe` reads one metadata object from stdin and defaults
to preview. JSON summaries go to stdout; fixed failure diagnostics go to stderr
without echoing settings or input. Setup errors return 1. Observation errors
return 0 with no success receipt so optional capture does not block the original
operation. Callers must inspect `recorded` rather than equating exit 0 with
evidence.

The five observation inputs are `collection` and `skill` slugs,
`kind` (`read_attempt` or `read_confirmed`), an opaque 64-hex
`session_key`, and canonical UTC `observed_at`. The sink adds a random
`event_id` and schema version. It appends local JSONL, creates no network
connection, and rejects unknown payload fields. Do not derive a session key from
prompts, a username or other personal content. The reference sink does not
deduplicate, aggregate, authenticate producer claims or inspect native results.

### Idempotence and side effects

An identical active registration returns without writing. Explicit enablement
changes only the selected settings and sibling receipt; observation writes append
only to the selected evidence store. Explicit removal retains evidence and an
inactive receipt. Commands use temporary sibling files and cooperating locks,
and never modify this installed package or install a runtime.

Configuration is capped at 128 KiB, stdin at 16 KiB and evidence at 4 MiB.
Select existing normalized parent directories. Files must be regular and
unlinked; ancestor links and observed concurrent changes are rejected. A local
exclusive lock serializes cooperating writers; occupied locks are never deleted
automatically. These checks assume stable caller-owned directories and are not
a sandbox against malicious concurrent replacement or a crash-proof transaction.
Non-regular files are rejected before opening; nonblocking no-follow opens and
descriptor checks also reject a FIFO substituted during opening.
Platforms without these file primitives fail explicitly; execution was tested on
POSIX, and Windows behavior remains unverified.
Two-file settings/receipt writes attempt rollback without overwriting a changed
settings file. Keep a preimage separately for operator recovery after a crash.

If ownership drift appears, stop mutation and inspect the current entry and
receipt. If a runtime disappears, status reports it; restore an explicitly
selected runtime or remove the registration. If storage fills or is unwritable,
retain evidence, report a coverage gap and select another explicit store.
Never download a runtime during a hook event.

### Fallback

For another provider, load [implementation wiring](references/implementation.md)
for the injected provider interface, file layout, complete configuration and
limits. Without Node or trusted hooks, manually preserve the same ownership
receipt and metadata schema in caller-selected files; inspect changes first,
remove only exact owned entries, and report automatic capture as unavailable.
Installation, discovery and activation never run this skill's setup entrypoint.

For provenance or redistribution review, load the
[research and reuse record](references/provenance.md).
