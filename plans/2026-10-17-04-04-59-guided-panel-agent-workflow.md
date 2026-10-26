# Guided panel review and proposal workflow

Related: PR #107, issue #106 and Beads i9-skills-o7j. The operator inspected a
skill and could not continue from a finished chat to a retained diff. The
captured legacy flow exposes an unsent task draft, a full candidate-text editor
and an ID-only proposal lookup. This is an interaction correction within the
approved library/comparison design, not a visual redesign.

## Outcome and scope

Make the normal path selectable from the panel: inspect a skill, request an
agent review or a specified improvement, see its recorded result, compare a
retained proposal and explicitly approve application. Review-only and blocked
results must explain why no diff exists. Retained work must remain discoverable
after the chat or panel is reopened, without copying text or proposal IDs.

Use the host's advertised text-message capability for a user-clicked request to
the active conversation. The backend never executes a model or sends messages.
A refusal, unsupported host or uncertain delivery must remain visible; do not
claim that an agent is running merely because a message was accepted. Keep a
clearly labeled manual fallback outside the primary path.

Persist bounded, integrity-checked request and result records in the already
selected private panel state. Correlate them with immutable request IDs and the
observed selected-package or read-only global-entrypoint identity. Expose
closed request, completion and activity MCP tools. A completed result may link
an existing matching retained proposal, report no changes, return findings or
record a blocker. Repeated identical completion is idempotent; conflicting,
cross-skill, cross-base or global-mutation linkage is refused.

List retained proposal summaries and request results by selected source-qualified
skill. Opening a proposal still performs the existing full verification. Merely
opening the panel or reading absent history must not create state. Bound stored
requests and history reads; preserve all existing proposals and recovery data.

## Layers and instruction map

Current and target chains are unchanged: root AGENTS.md owns authority; src owns
runtime/service/repository/validator/transport responsibilities; tests owns
disposable regressions; website owns multilingual candidate availability; plans
owns the durable recipe index. Add this recipe to plans/AGENTS.md only. No child
scope, distributed package procedure or package metadata changes are needed.

Reuse the existing SkillEvolutionRepository state confinement, locks and record
integrity for the cohesive change-request aggregate; keep host messaging and
workflow rendering in the panel, service orchestration and closed inputs in
their existing layers. Keep filenames/classes and singular source directories.
No dependency, SQLite migration, provider credential or new executable is added.

## Interface and sequencing

1. Capture the current overview, unsent review, manual candidate and ID lookup;
   retain a numbered UX/accessibility audit with screenshots.
2. Add bounded request/completion/activity storage and protocol contracts, with
   honest metadata-only history summaries and full verification on opening.
3. Replace the primary unsent-copy/editor actions with host-assisted review and
   improvement requests; keep optional focus text small and manual editing
   explicitly secondary. Show requested, no-result, completed, blocked,
   no-change and proposed states without inferring execution or readiness.
4. Show activity and selectable proposals directly in the workspace. Refresh on
   selection, explicit checking, relevant tool results and a bounded visible
   waiting loop. Ignore stale selection responses; never auto-resend a message
   or clear unresolved-write identity to open another result.
5. A matching completed proposal is selectable directly into the existing comparison. Preserve all
   source identity, exact-diff, stale-source, unknown-write and explicit-consent
   checks. Continue review explicitly reloads the same request instructions;
   it never silently creates another review or retries a host message. Global
   skills permit review only, never proposals or writes. Keep unchanged polling
   results from replacing focused controls, and put approval below the comparison
   so it cannot obscure the changed text.
6. Update operator docs, the existing package-bound minor Changeset and
   candidate-only EN/PT-BR/ES website copy. Update only the authorized private lab
   after validation, preserving its selection, global references and state.

## Validation and authority

After explicit npm ci on Node 24+, run meaningful request/result/history,
malformed-input, idempotence, stale-source, global-read-only, confinement,
missing-store and transport tests; run the full check, package checks, Changeset
status and whitespace checks. Exercise real backend requests/results/proposals
with a synthetic host and disposable packages in the browser; distinguish that
fixture from provider execution. Check desktop/narrow, keyboard focus and
light/dark behavior against the retained approved visual target.

Obtain independent review on the exact commit, reconcile the PR HEAD/checks,
record evidence in Beads and keep native host/provider acceptance separate.
Existing authorization covers the private lab and same PR, not a merge, release,
public plugin submission, deployment, global writes, a host restart or expanded
permissions. Do not alter the original real proposal during synthetic tests.

## Rollback

Revert the new workflow tools/view to the preceding manual workflow and reinstall
the prior private lab through its supported flow. Preserve the new request
records and all proposal/preimage/recovery data; no cleanup or migration is
required. Restore the plan index with the source rollback.
