# Generic configuration and sink wiring

The runnable implementation is `scripts/usage_setup.mjs`, resolved relative to
the installed package. It imports only Node built-ins. The caller supplies all
configuration and state locations; no checkout catalog or root configuration is
used.

```text
installed-package/
  SKILL.md
  scripts/usage_setup.mjs
caller-workspace/
  settings.json
  registration.json
  settings.json.skills-usage.json
  reads.jsonl
```

Registration is exactly one object with `provider`, `hook_path`,
`events`, `runtime_files`, `collections` and `store`. The minimal
entrypoint example supplies all six fields. There is no implicit configuration
search or environment precedence: CLI arguments select files; the explicit JSON
selects collection roots, sink and existing runtime files. Hooks are arbitrary
reviewed JSON entries, not executable input to this helper. Events are one to
eight named arrays with one to sixteen distinct object entries each.

The default provider supports a one-to-four-segment path to an event-map object.
Existing keys are preserved, matching unowned entries are refused, and removal
requires exactly one match for every owned entry. Equality canonicalizes object
keys. Repeated enable with unchanged owned configuration is a no-op. A changed
registration requires removal/reconciliation before a new enable.

To integrate another trusted schema, import the helper as a module:

```js
import { setup, jsonArrayMapProvider } from '/absolute/installed-package/scripts/usage_setup.mjs';
const provider = {
    ...jsonArrayMapProvider,
    id: 'reviewed-array-map',
};
const preview = setup({
    action: 'enable',
    file: selectedSettings,
    registration: { ...reviewedRegistration, provider: provider.id },
    provider,
    write: false,
});
```

This complete adapter uses the same array-map behavior under another explicit
identity. A different format implements `id`, `inspect(settings,
registration)`, `merge(settings, registration)` and `remove(settings,
registration)`. Inspect returns a Boolean; merge/remove return new JSON objects
without mutating inputs. The provider must preserve unrelated fields, refuse
ambiguous ownership and never execute commands. It is trusted code reviewed by
the caller; registration JSON cannot select or import executable providers.
The CLI uses only the bundled provider.

The sibling receipt identifies the skill owner, selected settings filename,
provider, exact registration, its digest and active state. It contains local
paths and commands and must stay private. Its digest detects accidental drift;
it does not authenticate a receipt against malicious replacement by another
writer. Status inspects current ownership and existing runtime files without
opening the sink. Removal retains JSONL and an inactive receipt.

The metadata producer shown in the entrypoint wires an actual controlled
entrypoint read to the sink. A native adapter instead validates its own event,
maps only whitelisted read metadata, and passes that object to `observe`.
Never pipe a raw host event directly: unknown fields are rejected and stdout
from a setup command is not a native read receipt.
The direct sink does not discover collection roots. Pass the external evidence
filename selected by the inspected registration; independently supplied sink
paths remain the caller's responsibility. Existing JSONL bytes are retained, not
retroactively authenticated or sanitized.

POSIX filesystem fixtures are tested. A platform lacking equivalent regular-file,
link, lock or rename behavior needs separate verification; Windows host launch
and provider-specific command quoting are not established by the generic tests.
