# Explain sidebar actions and preview change approval

Status: local design iteration, not a skill editor or generated change service.
Related: [issue #106](https://github.com/i-9-ai/skills/issues/106), draft PR107.

## User outcome

Make review and evolution actions understandable, show what is known about the
selected skill, and demonstrate a reviewable diff before explicit approval.
The user liked the panel but could not tell what the action buttons would do.
They expect proposed skill changes to be visible before approval.

## Scope and boundaries

Update the existing standalone HTML proposal with keyboard-accessible question
buttons, honest snapshot state and a small review workspace. Keep the useful
task draft. Review means inspect and report; evolution means plan justified
changes. Neither action promises that every inspection needs an edit.

The sample change uses a clearly synthetic `example-skill/SKILL.md`, never
fabricated contents or evidence for the selected real package. The workspace
starts with no proposal or review result. Loading the example is explicit.
Example approval requires acknowledging its diff, changes only page memory,
and is invalidated when the example or selected workflow resets. No file write,
agent execution, actual approval receipt, installation or publication is added.

Show frozen collection metadata separately from unknown installed state,
review evidence and usage. Missing evidence is not a failed or successful review.
Future real approval must bind the exact selected source/base and complete patch;
changed bytes or proposals invalidate approval before any authorized application.

## Native test evidence

The operator reported that a lab entry opened, then reported an eight-second
MCP Apps initialization timeout. A real read-only call to the installed lab MCP
succeeded from this chat. The operator subsequently reported apparent success
for the component opened through that tool. These are distinct observations:
a file preview, local MCP connection, inline component and global sidebar entry
are not interchangeable. The current tooling can inspect full-screen MCP Apps,
but none was exposed in that inventory. Do not claim independently verified
global sidebar or bridge support from the browser preview or tool result alone.

## Implementation and verification

1. Extend existing CSS/markup/controller without external assets or libraries.
2. Add help, snapshot state, empty-proposal and illustrative diff/review states.
3. Preserve draft creation, search, selection, themes and narrow layouts.
4. Inspect actual browser help/dialog/approval/changes-requested/reset behavior,
   keyboard focus and overflow. Parse the exact embedded script and check the diff.
5. Review the exact tracked commit independently, then update the same draft PR.
   If refreshing the private lab, use its existing installation workflow and a
   new asset URI/version; never edit the installed cache directly.

Repository checks remain required. Reuse earlier successful unchanged runtime
checks only when applicable; repeat affected checks after changes. No changed
skill package is involved. The website remains unchanged because this is an
unreleased experiment; do not advertise a working editor or approval backend.

## Ownership and rollback

Root instructions and `plans/AGENTS.md` retain their scopes. The same preview is
the only tracked UI artifact; create no instruction hierarchy or second skill
tree. Remove this iteration together with its index and documentation-only
Changeset updates if superseded. Resetting the page discards sample decisions;
caller skills and evidence remain untouched.
