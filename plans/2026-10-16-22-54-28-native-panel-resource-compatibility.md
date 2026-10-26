# Native panel resource compatibility

Related: issue106, draft PR107 and the existing functional panel pilot.

## Problem and bounded outcome

The native sidebar discovers `skill_panel_open`, but displays its technical name
and cannot load its HTML. The registered MCP connection answers the catalog tool
and resource listing; the client's resource read fails with -32602. A controlled
reproduction shows that the bare URI succeeds while the same URI with standard
request `_meta` fails. Resource-template discovery also returns -32601, unlike
the preceding working probe. The open tool omits that probe's human-readable
`title`.

Make the existing shared panel resource compatible with these client requests.
Keep the single fixed URI, six-tool pilot mode, private selected collection/state,
approval requirements and ordinary MCP mode unchanged. No new server, network
listener, data selection, credential, access grant or dependency is needed.

## Instruction map and implementation

Current and target instruction chains remain root → src, root → tests and
root → plans. There is no new contract, ownership boundary or instruction file.
Only the existing plans index gains this reproducible repair recipe.

1. Add a failing shared-stdio regression for resource reads carrying reserved
   request metadata. Keep malformed metadata, extra arguments and other URIs
   rejected. Never interpret metadata as file or tool access authority.
2. Accept an optional object `_meta` alongside the exact fixed URI; ignore its
   contents. Return an empty resource-template list in explicit panel mode.
3. Supply the open tool's human-readable title. Preserve its technical tool name
   and UI resource identity so consumers retain a stable interface.
4. Update the existing Changeset and troubleshooting guidance. Verify source,
   compiled/packed runtime and actual registered-client resource access separately.
5. Independently review the exact commit, update the same draft PR and update
   only the existing private lab through its supported installation flow.

## Authority, verification and recovery

Use disposable fixtures for tests. The already authorized lab remains scoped to
the existing private real-skill copy and retained proposals. Do not restart Codex,
kill an active process, mutate the public plugin or publish a release/deployment.
If the host retains an old MCP process, ask for the exact component/plugin refresh
and continue independent checks; installation is not proof of a loaded process.

Run explicit `npm ci`, affected protocol tests, `npm run check`,
`npm run package:check`, Changeset status and `git diff --check`. Confirm that the
normal MCP exposes no new resource API. Native acceptance requires an actual
client read and visible panel observation, not the browser relay or CLI smoke
alone. Preserve the failed native screenshots and prior test outcomes.

Revert the focused source/descriptor changes to remove this compatibility
repair, and restore the prior private lab configuration through the supported
installer if necessary. Never delete or restore skill/proposal data as part of
transport rollback.
