# Version PR readiness checks

## Objective and accepted scope

Complete repository issue [#87](https://github.com/i-9-ai/skills/issues/87) and
Beads task `i9-skills-orp.2`. The user authorized finishing accepted repository
work through reviewed PRs. The generated version PR #86 has an empty required
check rollup; its existing source workflows omit the maintainer's draft-to-ready
event. This independently reviewable correction has its own plan and rollback.
Keep the earlier changelog/availability plan as an immutable record.

## Current and target behavior

The three protected workflows currently use the default `pull_request` activity
types. Explicitly retain `opened`, `synchronize` and `reopened`, and add
`ready_for_review` in `validate.yml`, `changesets.yml` and `secret-scanning.yml`.
An owner marking the reviewed version draft ready can then start the protected
checks at its current head. If GitHub presents a workflow-approval banner, retain
that existing maintainer approval path too.

## Implementation and instruction map

- Add only the event types to the three workflows; keep check names, push
  branches, exact-head checkout and read-only permissions unchanged.
- Add parsed-YAML regressions for the complete event matrix and authority
  boundaries; preserve existing workflow security tests.
- Update release documentation and its Mermaid flow, add a patch Changeset and
  link this plan from `plans/AGENTS.md`.
- Use the current root and `tests/AGENTS.md` contracts. No new instruction scope,
  dependency, source adapter or CLI interface is needed.

## Authority boundaries and exclusions

Root owns serialized Beads tracking and Git/PR integration in the canonical
checkout. An implementation agent may edit only the three workflows and their
test; an independent reviewer evaluates the exact commit. Preserve the official
Changesets/OIDC version and publication flow. Do not add stored tokens,
`pull_request_target`, privileged PR jobs, protection bypasses or artificial
commits to the generated version branch. No package publication occurs on the
ready transition. Consumer installations and external modules remain outside
this correction.

## Validation and rollout

1. Run explicit `npm ci`, `npm run check`, `npm run changeset:status` and
   `git diff --check` with Node 24. Verify the new event and unchanged defaults,
   job names, checkout, push branches and permission boundaries in fixtures.
2. Obtain independent review of the exact feature commit and resolve findings.
   Merge only after protected checks pass, using existing authorization.
3. Let the official version workflow regenerate the draft against the new main.
   Independently review that generated SHA and reproduce its complete release
   content offline with `npm run release:verify -- --base <full-base-sha>`.
4. Mark that draft ready as the maintainer; observe all three protected checks
   on its exact head before the authorized version merge. Record the actual run
   evidence in Beads and close the task only after this real event is proven.

## Rollback

Revert this feature commit to restore the prior workflow event selection and its
documentation. The separate changelog generator, reference receipt protocol and
availability job stay intact. A revert does not move version tags, change npm
artifacts or authorize publication; version drafts still need review and checks.
