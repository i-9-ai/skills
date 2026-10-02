# MCP identity, reviewed observers and module interoperability

## Objective

Finish repository-owned follow-ups #75, #76 and #7, and explain the separate
local MCP and public directory distribution paths. The public skills-only ZIP
must remain usable without a hosted service or an automatic installation.

## Scope and boundaries

- #75: derive MCP server version from validated installed package identity,
  preserving the independent protocol version and initialization without state.
- #76: provide a closed optional metadata observer descriptor, bind reviewed
  runtime bytes and derive native registration syntax through verified adapters.
  Reject arbitrary executable selection and shell fragments in this route.
  Require retained read-only observer code and dependencies inside its inspected
  runtime; ordinary mutable checkouts and npm caches are not hook runtimes.
  Preserve unrelated settings, receipts and existing evidence; generic settings
  remain a clearly separate manual reference workflow.
- #7: define module admission and interoperability with a synthetic fixture,
  mapping existing federated discovery evidence rather than creating modules.
- Document and verify the published CLI's local stdio MCP invocation via npx.
  The public submission portal currently requires remote HTTPS MCP and cannot
  add MCP to an existing skills-only plugin. Do not imply local stdio can appear
  there, declare an unavailable endpoint, or change the ZIP already in review.

No hosting, new dependencies, telemetry upload, user-home mutation, consumer
installation, portal submission, attestations, or new module repository creation.
The existing public submission excludes skills-usage-setup until native capability
and provider review are resolved. Hardening is not provider approval.

## Sequence

1. Track these bounded outcomes in local Beads and assign independent owners.
2. Implement installed identity, closed observer and module contract changes in
   the same feature branch with disjoint ownership and synthetic tests.
3. Update local MCP guidance and representative npx/configuration examples.
4. Run explicit npm ci on Node 24, affected tests, check, package checks,
   Changeset status, official skills-ref validation and whitespace checks.
5. Commit the coherent implementation and obtain independent review of that
   exact revision. Fix relevant findings and repeat affected verification.
6. Deliver a PR with concrete Changeset notes and close each Beads task only
   when its evidence is verified. Reviewed green PRs may be merged under the
   user's existing authorization; release publication uses Changesets.

## Acceptance and evidence

Handshake versions match installed CLI/plugin manifests; malformed identity
fails without initialization writes. Observer preview, explicit enablement,
status and exact-owned removal have disposable fixture coverage for injected
commands, stale descriptors, unsafe or changed runtime assets and preservation.
Module discovery shows source identity, collisions and safe unsupported results.
Documented npx MCP initialization and tool discovery work outside this checkout
without creating an evidence database. Retain commit, checks and reviewed limits.

## Instruction map

Retain the existing reading chain: root authority, then `src/AGENTS.md` and
`src/command/AGENTS.md`, with `src/command/hook/AGENTS.md` for hook adapters.
Tests and plans keep their existing local contracts. Distributed packages read
`.agents/AGENTS.md` and retain procedures in `SKILL.md`; public documentation
keeps its existing agent-facing reference. No new instruction scope is needed.

Update the hook contract with the reviewed-digest requirement, add the runtime
repository's inspection boundary to the source index, and link this plan and the
module contract from their existing indexes. Keep invocation, effects and recovery
in `bin/index.md` and the skill's bundled examples rather than duplicating them
in instruction files. Validate the reading routes and local links with the
collection checks. Reverting these index changes together restores the prior map.

## Rollback

Revert this feature change through Git. Do not alter user settings, reset Beads,
delete telemetry, remove recovery snapshots, or undo the user's submitted ZIP.
