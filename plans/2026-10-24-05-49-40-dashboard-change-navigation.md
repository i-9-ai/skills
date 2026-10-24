# Dashboard change navigation and retained-history resilience

## Objective and scope

Continue [PR107](https://github.com/i-9-ai/skills/pull/107) with bounded navigation
between changed blocks, so an operator can inspect a long entrypoint without
searching through both panes. Also correct the confirmed optional-global-outage
review finding: retained local history must remain readable while unsafe writes
still refuse an unavailable global boundary.

Beads tracks the navigation under `i9-skills-kyp` and the review fix under
`i9-skills-49x`. Portable onboarding and broader review-progress work remain
separate unfinished acceptance items in `i9-skills-kyp`.

## Contract map and boundaries

Keep the existing root → `src/`, `tests/`, `website/` and `plans/` instruction
boundaries. Add only this linked plan to the plans index; no new child contracts
or distributed skill procedures are needed. The diff service owns bounded block
coordinates; the panel owns selection and independent pane scrolling. Navigation
never supplies approval, performs a tool call or changes retained proposal bytes.

Only read-only state access may skip the optional global write-boundary scan.
Private state ownership, selected collection separation and record integrity
checks remain required. Every mutation retains the full boundary check.

## Sequence and removal path

1. Reproduce the global outage with disposable packages and retained requests.
2. Restrict the global write-boundary preflight to actual mutations.
3. Return bounded per-side block coordinates with the existing comparison.
4. Add previous/next controls, block count and independent per-pane scrolling;
   reverse coordinates for recovery and explicitly disable navigation in the
   plain-text fallback.
5. Update English documentation, the existing Changeset and equivalent website
   copy. Verify unit, protocol, full repository and packed-runtime behavior.
6. Obtain independent review on the exact commit and verify PR CI. If updating
   the private lab, prepare a fresh retained runtime and use supported install;
   retain existing selections, proposals and permissions.

Revert the implementation and its documentation together to remove navigation.
No retained state migration or deletion is involved. No new dependency, public
deployment, release, marketplace submission or real skill mutation is authorized.

## Acceptance and evidence

- Multiple separated replacements, pure insertion/deletion and recovery navigate
  to the correct line on each side without changing consent or proposal identity.
- Inline projection plus block coordinates stays within the existing size/row
  budget; oversized comparisons preserve exact plain text and unified diff.
- Missing optional globals do not block local activity/request/proposal reads;
  new requests, candidates, apply and recovery refuse without state/source writes.
- Use Node24 after explicit `npm ci`, targeted isolated tests, `npm run check`,
  `npm run changeset:status`, `npm run package:check` and `git diff --check`.
- Retain exact commit review, CI and any private installation observations in
  the PR and Beads. Browser, protocol and installed-byte evidence do not imply
  new native acceptance or public distribution eligibility.
