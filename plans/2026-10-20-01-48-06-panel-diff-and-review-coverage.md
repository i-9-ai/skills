# Precise panel diffs and review coverage

## Objective

Make small edits inside long skill paragraphs legible before approval and expose
which supporting files a review actually reports reading. Continues PR #107.

## Scope and limits

- Compute bounded line matches and word-level highlights without dependencies.
  Keep unchanged text neutral and retain the exact unified diff and EOF markers.
- Expose inert bounded UTF-8 package resources through inspection, with package
  revision checks. Show the package inventory separately from agent-reported
  review coverage; old outcomes have unknown coverage.
- Extend completion with optional, validated reported file paths. This is an
  agent assertion, never proof of comprehension or successful execution.
- Continue to propose, approve, apply and recover **only SKILL.md**. Other files
  stay unchanged. Do not execute scripts, follow external references, mutate
  actual skills, enlarge global permissions or publish a plugin.

## Implementation and rollback

1. Add shared bounded comparison service and render its line/token projection.
2. Add confined resource inspection and optional completion coverage.
3. Update panel guidance, documentation, Changeset and equivalent site copy.
4. Exercise synthetic source/resource/approval/recovery cases, review the exact
   commit and retain verification evidence. Prepare a new private lab artifact
   through the existing supported update flow while preserving old state.

Revert this change to remove the presentation and optional ingress. Old review
records remain readable; do not discard proposals, requests or recovery bytes.

## Validation and acceptance

Use explicit `npm ci` and Node.js 24+, targeted view/service/protocol tests,
`npm run check`, `npm run changeset:status`, `npm run package:check` and
`git diff --check`. Verify separated edits, punctuation, Unicode, repeated words,
EOF-only changes, safe HTML text, bounded fallback and exact byte reconstruction.
Verify resource traversal/link/binary/oversize/stale rejection and distinguish
unknown, partial and agent-reported coverage. Approval remains tied to original
and candidate package hashes; tests never read or write installed skills.

Retain exact revision, independent review, test output and private lab inventory
outside tracked source. Native user acceptance and public review are separate.
