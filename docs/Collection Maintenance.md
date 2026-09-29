# Collection audit and explicit maintenance

The collection commands inspect a caller-selected skill collection, produce a
reviewable remediation plan and apply its supported operations explicitly. They
work locally through the installed CLI and package helpers. They never invoke a
model, install dependencies, execute candidate scripts or rewrite skill prose.

Use Node 24+ and the prepared CLI. In a source checkout, run `npm ci` explicitly
before calling `node bin/index.mjs`. The same commands are available as `i9-skills`
from the verified installed package. No global or home collection is selected by
default: both `--collection` and `--layout` are required.

## Inspect, plan and preview

Keep reports and recovery state outside the selected collection:

```sh
node bin/index.mjs collection audit \
  --collection /example/skills --layout repository \
  > /example/review/audit.json

node bin/index.mjs collection plan \
  --collection /example/skills --layout repository \
  --audit /example/review/audit.json \
  > /example/review/plan.json

node bin/index.mjs collection evolve \
  --collection /example/skills --layout repository \
  --plan /example/review/plan.json
```

Create the caller-owned report directory before redirecting output. Shell
redirection writes these explicitly selected reports; the audit and planning
operations themselves only read the collection. `repository` selects
`.agents/skills`; `global` selects `skills` beneath the explicit collection root
and excludes reserved `.system` content. Package links are not followed by this
maintenance profile.

Audit output records `schema_version`, `policy`, `baseline`, `packages`,
`catalog`, `findings`, `coverage` and `validation`. Independent invalid packages
produce findings while inspection continues across the remaining safe inventory.
Catalog status is `current`, `missing`, `stale`, `malformed` or `unavailable`.
Coverage and omissions determine what the report can establish. Local structural
checks do not mean official Agent Skills conformance or behavioral evaluation;
those remain `not_run` unless separately performed.

The plan records the selected audit's digest, baseline, supported `operations`,
pending `handoffs` and coverage. Generating it rechecks the collection against the
audit. Review the proposed effects and every handoff before using it. A plan is
data, not a script: arbitrary commands, targets and replacement content are rejected.

`collection evolve` previews by default and returns `status: "preview"` without
changing the collection or creating snapshots. It validates the selected plan
and its baseline again; preview is not an approval record or an installation.

## Supported application

The initial automatic operation is `catalog.sync`, targeting only
`skills-catalog.json`. A missing or structurally valid but stale catalog can be
regenerated from current packages. A malformed existing catalog requires a
handoff, preserving its original bytes for inspection.

Content, license, example, icon, naming, merge/split and semantic contract changes
require the relevant authoring or evolution work. They remain in
`remaining_handoffs` after catalog application. Successful synchronization does
not claim that those findings are fixed.

Apply the deliberately selected plan:

```sh
node bin/index.mjs collection evolve \
  --collection /example/skills --layout repository \
  --plan /example/review/plan.json --apply \
  --snapshot-store /example/recovery
```

`--snapshot-store` must be an absolute external directory when a write is planned.
A plan with no supported operations returns `unchanged`, retaining its handoffs.
No task database, background updater, installation, publication or Git mutation is
part of this command.

## Stale plans and recovery

The baseline binds the plan to an opaque identity of the selected root and layout,
catalog bytes or explicit absence, and package paths, modes and content. Moving to
another collection or changing a body, reference, mode, inventory or catalog
invalidates it. Rerun audit and planning; do not edit a digest to bypass the check.
The CLI also recomputes the expected supported operation and resulting bytes.

Before writing, it stages a minimal preimage containing the old catalog and mode,
or an explicit absence marker. It creates a snapshot under
`<snapshot-store>/catalog-<unique-id>`, verifies it and restores a temporary copy
to prove recovery. It never snapshots the whole repository, Git database,
dependencies or unrelated files. It rechecks the baseline immediately before the
existing catalog helper performs atomic replacement.

After application, it verifies expected catalog bytes, freshness and unchanged
package fingerprints. On post-write failure it restores only the original
catalog bytes/mode or original absence and verifies that restoration. Keep the
collection stable while the command runs; these checks do not provide a
transaction against hostile concurrent filesystem edits.

The JSON result reports `status`, `applied`, before/after digests, operations,
`remaining_handoffs`, snapshot details and preimage/catalog/rollback verification.
`applied` establishes the supported write only. `rolled_back` and `rollback_failed`
return a nonzero exit status and distinguish recovery from successful delivery.
Invalid or stale input fails before snapshots or collection writes. A terminal
`maintenance-result.json` is retained beside the snapshot's manifest, receipt
and content objects. Preserve this recovery state until an explicit retention
decision; the command does not delete it after success or failure.

## Limits and next checks

The maintenance profile bounds the whole operation: 256 packages, 16,384 shared
entries, depth 24, 4 MiB per file, 64 MiB total content, 512 findings and 1 MiB JSON
inputs. Snapshot subprocess output is at most 1 MiB with a ten-second timeout.
Unsafe files, incomplete coverage or exceeded limits prevent application.

Use the relevant package's instructions for semantic remediation, then repeat the
audit. Run the [official and local validation](Validation.md) applicable to the
changed packages and evaluate their actual task behavior separately. The
[architecture](Architecture.md) describes the boundary between procedural skills
and this deterministic optional CLI adapter.
