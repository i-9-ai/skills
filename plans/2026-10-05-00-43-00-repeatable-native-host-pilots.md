# Repeatable native host pilots

Issue: [#90](https://github.com/i-9-ai/skills/issues/90).
Status: implementation in progress; canonical operator checkpoint committed and
structurally checked, initial native captures retained, full semantic bindings
and repeated lifecycle acceptance pending.

## Objective

Make installation, discovery, native lifecycle hooks, MCP startup and an exact
source-pin A → B → A refresh independently inspectable in Codex and Claude. Run
two fresh repetitions per host. Preserve unrelated configuration and prior local
evidence, and report unsupported state or host contracts as blocked. This is
host integration evidence, separate from behavioral evaluation of skills.

## Scope and inputs

Use the existing single CLI, dependency-free installed TypeScript transports and
singular N-layer components. Adopt the reviewed bounded private coordinator and
explicit host observers only after their inventories and tests are reconciled.
Do not add a second functional CLI or silently install optional telemetry.

Candidate A is commit `6545479e2733682c5b3f57e9cdda7954dcdd4173`; B is the
reviewed PR #96 merge `0994488e95ddd7ecceadd7d461e5cac0c5877979`. Both advertise
0.3.4. The exercise therefore tests changed source bytes and restart, not a
semantic-version upgrade or a hosted marketplace update. Complete clean Git
exports, internal relative aliases, file inventories and changed skill/resource
witnesses must be verified before execution. Commit assertions alone do not
authenticate a binary or an executed process.

Select Linux arm64, Node 24.21.0, Codex 0.160.0 and Claude 2.1.285. Resolve an
official container image to an immutable platform digest and independently
retain archive SHA-256/SRI, selected binary hashes, versions and license notices
before use. Unauthenticated acquisition must use an explicit minimal child
environment and disable ambient client configuration. The initial archive
requests supplied no explicit credentials but did not disable inherited curl
configuration; retain that limitation instead of claiming anonymous transport.
Matching archive integrity proves selected bytes, separately from transport,
source review and actual native observations. Never vendor native binaries or
private captures into Git, documentation, Wiki, npm or plugin packages.

## Execution authority and confinement

The accepted project work and issue authorize disposable native consumer tests.
Use newly owned local container resources only. The ordinary image account's
passwd home is its real home inside that disposable system; never redirect the
machine user's HOME, CODEX_HOME or real profile. Do not read or mount user
credentials, home directories, host devices or Docker sockets into a container.
Use an empty owned Docker client configuration for image acquisition.

Each host/repetition has a fresh container, read-only root filesystem and
prepared inputs, owned writable account/state/work/evidence volumes, no external
network, dropped capabilities, no-new-privileges, init and bounded resources.
Measure the actual account UID/GID and passwd/HOME, mounts, network namespace,
interfaces/routes, security flags and allowed/denied writes before running a
client. A label or supplied confinement receipt is insufficient.

Codex may use a bounded fixed loopback response fixture inside this isolated
container when its actual lifecycle requires a turn. It cannot forward requests,
authenticate to a provider or execute model-requested tools. Retain the distinction
between tool definitions advertised by a native client and actual tool calls.
Claude uses its documented init-only and diagnostic paths; unknown native output
blocks observation instead of falling back to a prompt or guessed proof.

No real-user installation, provider operation, external repository creation,
release preparation/publication, marketplace submission or production change is
authorized by this plan. Existing native pilot evidence remains unchanged.

## Ordered implementation

1. Finish exact private controller/observer contracts and independent review;
   reconcile the sealed coordinator, source pins and runtime inventories.
2. Verify exact image/archive bytes before extraction and retain actual
   acquisition controls and their limits. Use the reviewed minimal client
   environment for later requests. Preserve historical provenance and ownership
   receipts in the private evidence root rather than replacing them after a fix.
3. Prepare complete A/B source exports and preservation sentinels. Verify the
   restore drill without executing candidate scripts during preparation.
4. Execute the four lanes through fixed shell-free process boundaries. Retain
   native-loaded roots/changed bytes, hook completion and output, MCP health and
   catalog/resource evidence, process stop/restart, prior rows and unrelated
   settings. Directly invoking a plugin transport is not native acceptance.
5. Preserve blocked/failed phases and recovery. In particular, old A may reject
   B's newer evidence schema; observe that refusal without resetting data or
   calling the rollback a pass. Keep-data unregister precedes marketplace removal.
6. Adopt the bounded operator capability, docs and Changeset in this repository;
   keep raw private logs outside discovery and distribution. Update relevant
   diagrams only where the actual interface changes.
7. Run local checks, clean consumer packaging, exact-commit independent review
   and required CI. Merge only the reviewed delivery. Close Beads/#90 only when
   both supported native hosts have repeatable actual evidence.

## Verification and retained evidence

Unit/integration tests use fake executors and synthetic disposable inputs; the
ordinary repository suite cannot invoke Docker/native clients, install packages
or use the network. Test preflight with no effects, closed contracts, input and
output bounds, preserve-before-cleanup, stale inventory rejection, A/B loaded
root discrimination, stop-before-switch, missing/unknown native evidence and
state preservation. Run `npm run check`, clean packaging tests,
`npm run changeset:status` and `git diff --check` under Node 24.

Retain exact source/runtime/adapter inventories, OS observations, native raw
artifacts, phase results, database/sentinel comparisons and cleanup receipts in
the owned private root. Public reports contain normalized capabilities, hashes,
results and limitations, without private corpus, host paths, prompts or secrets.
Integrity verification does not authenticate executor origin. Independent review
must inspect actual retained native artifacts as well as source and fake tests.

For the seeded-history exercise, version the closed runtime contract and use a
`read-only-mcp-preserved-state` gate with two explicit branches:
`absence_preserved` or `existing_unchanged`. An existing seeded store must retain
its rows, payloads and ordinary file bytes through the read-only observations.
That lane does not test native absent-store behavior. Keep earlier contracts and
captures with their original absence-only meaning; never reinterpret their
results as evidence for the new gate. Snapshot inspection cannot create or
migrate an absent store, and unknown or newer schemas block rather than reset.

The coordinator must use its own statically bundled observation parser. A
caller-supplied collector inventory or review receipt is input evidence, never
authority to import that collector into the host process. Execute selected
collector code only inside the measured container. The installed operator must
support its compiled distribution and bundled schema assets as well as the
explicit development route; verify both against their actual file inventories.

## Rollback and removal

Preserve earlier source and receipts. Stop owned processes before switching the
source child inside a stable read-only bind parent, restart and re-observe loaded
bytes. Recovery cannot erase a failed update or downgrade a newer evidence store.
Delete only named, newly owned containers/volumes after verified private evidence
retention and data-preserving unregistration; never prune shared Docker resources.
If a host contract cannot be automated, retain the blocked result and a complete
manual fallback. Removing the operator capability never deletes retained evidence
or installed real-user state.

## Instruction map

Retain the existing root, source, command, test and plan boundaries. The pilot
adds code to existing singular layers; it does not need a new child contract.

| Existing contract | Target decision and indexed responsibility |
| --- | --- |
| `AGENTS.md` | Retain repository authority and existing source/test/plan reading routes. |
| `src/AGENTS.md` | Update the index for bounded pilot orchestration, process audit and fixed worker transports; native execution remains explicitly selected. |
| `src/command/AGENTS.md` | Index the single plugin pilot command and operator guide; commands do not own confinement or evidence validation. |
| `tests/AGENTS.md` | Index disposable fake pilot tests; ordinary checks never invoke native clients or Docker. |
| `plans/AGENTS.md` | Index this plan and its no-profile/no-publication boundary. |

Read root → source for implementation, root → source → command for the route,
root → tests for regressions, and root → plans for the recipe. Keep detailed
operator instructions in the existing native pilot guide and CLI guide, rather
than repeating procedures in indexes. Validate each added locator and restore
the affected indexes together with component removal if adoption is rolled back.
