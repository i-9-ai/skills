# Closed observer configuration and local sink

The complete runnable implementation is scripts/usage_setup.mjs. It imports only
Node built-ins and works when this package is installed alone. The entrypoint's
example includes file layout, descriptor creation, preview, reviewed enablement,
synthetic native receipt and exact-owned removal.

~~~text
installed-package/
  SKILL.md
  scripts/usage_setup.mjs
caller-workspace/
  observer/scripts/usage_setup.mjs   # deliberately retained, read-only copy
  settings.json
  registration.json                # closed descriptor
  settings.json.skills-usage.json  # private ownership receipt
  reads.jsonl                       # metadata only
~~~

## Closed automatic descriptor

The descriptor has exactly six fields: schema_version (1), kind
(skill-metadata-observer), host, runtime, collections and store.
Runtime has exactly executable, executable_sha256, script and script_sha256.
The executable is this running Node's canonical existing path; unrelated binaries
are refused even when their hashes match. The script must be a retained read-only
byte-identical copy of this installed helper. No command, event map, arbitrary
arguments, imports or executable provider can be supplied by descriptor JSON.

~~~js
import { createObserverDescriptor, setup } from '/absolute/installed-package/scripts/usage_setup.mjs';

const descriptor = createObserverDescriptor({
    host: 'claude',
    script: selectedReadOnlyRetainedHelper,
    collections: { selected: selectedCollectionRoot },
    store: selectedLocalEvidence,
});
const preview = setup({
    action: 'enable',
    file: selectedSettings,
    registration: descriptor,
});
// Inspect the complete descriptor, generated commands, paths and authority.
const applied = setup({
    action: 'enable',
    file: selectedSettings,
    registration: descriptor,
    write: true,
    reviewedRegistrationDigest: preview.registration_digest,
});
~~~

The selected Node is SHA-256-bound, executable, regular, unlinked and not
shared-writable. The script has no write bits. File and ancestor links, missing
assets, unknown descriptor fields, altered hashes, unrelated script bytes, state
inside discovery roots and unsupported hosts fail before settings writes.
Node can remain owner-updatable; an upgrade invalidates the selected digest.

Native adapters derive POSIX-quoted commands that invoke only the retained
helper's observe-host operation with the selected settings file. Copilot also
gets a closed preToolUse/postToolUse selector and version 1. There are no
caller-provided shell fragments, environmental substitutions or package-manager
commands in the generated registration. Direct API providers cannot override
these closed adapters. Native trust, actual host version and execution remain
separately verified.

Preview includes observer_descriptor, derived registration, canonical
registration_digest, settings and ownership_receipt. The digest includes the
descriptor and generated entries; it is not a signature or user consent.
Enablement rechecks identity before its cooperating lock writes settings and
receipt. Idempotent writes also require the exact digest. The receipt retains
generated entries, their integrity digest and the closed descriptor.
Status rechecks existing assets without opening the sink. The standalone native
observer rechecks receipt-bound runtime identity on invocation.

The helper needs a stable caller-owned filesystem. Read-only bits and SHA-256
detect reviewed-state drift; they do not prevent an owner from changing modes or
malicious concurrent replacement. The two-file update attempts rollback but
does not provide crash-proof atomicity. Keep a recovery preimage separately.

## Native metadata proof and sink

Claude observes only selected native Read entrypoint paths, with a successful
PostToolUse result field. Gemini observes read_file and requires an error-free
llmContent on AfterTool. Copilot CLI observes view and requires success plus a
text result on postToolUse. Their before-events record only attempts. Unsupported
tools, absent sessions/results, aliases or non-entrypoint paths remain gaps.
No Codex Bash parser is bundled in this portable helper.

The helper transiently reads a bounded event but never stores its raw JSON,
commands, result, prompt or file body. It inspects only regular entrypoint identity
under exactly one selected collection. The sink retains collection, skill,
read kind, hashed session key, UTC timestamp, generated event_id and schema_version.
Native stdout is neutral; successful host exit alone is not evidence. Inspect the
local sink. There is no network, upload, deduplication or inferred activation.

The observe command is a separate explicit metadata producer fallback. It reads
one object with exactly collection, skill, kind, session_key and observed_at
from stdin; preview is default and --write explicitly appends local JSONL.
It does not authenticate the producer or prove an asserted completed read.

## Generic manual configuration and legacy ownership

The former generic schema consists of provider, hook_path, events, runtime_files,
collections and store. It describes arbitrary host JSON. It now supports manual
preview only: setup rejects its enable --write route even with a reviewed digest.
This keeps arbitrary persistent commands outside automatic metadata setup.

A caller may deliberately use trusted manual JSON editing for a separately
reviewed configuration, preserving unrelated entries and explicit authority.
This skill does not authorize that arbitrary command, execute it or silently
convert generic data into a closed observer.

Existing generic receipts keep status and exact-owned disable support. They
report legacy_runtime_unbound and do not claim runtime content verification.
Missing, altered or duplicated owned entries block removal. Historical JSONL
and inactive receipts remain. Do not exchange generic receipts with the optional
toolkit's .i9-skills.json receipts or silently adopt unowned matching entries.

The existing jsonArrayMapProvider module export remains a manual/reference
array-map interface: id, inspect, merge and remove. Custom trusted providers may
describe manual previews or inspect/remove their already owned registration;
automatic closed observers use only bundled adapters. Registration JSON cannot
select or import code.

POSIX fixtures cover standalone execution and mutation boundaries. Windows
launch, quoting and provider-specific version behavior are unverified.
