# Recorded dashboard progress and local onboarding

## Objective and scope

Complete the remaining bounded interface/documentation work in Beads
`i9-skills-kyp`, continuing [PR107](https://github.com/i-9-ai/skills/pull/107).
Expose the saved request, recorded result and last inspected decision state near
the skill title. Provide a complete local marketplace registration recipe for
the retained plugin, without treating the public skills-only install as a panel.

This builds on change navigation at30fa3d7448b62231d0bb93aa0cba1b08a56ae431.
No dependency, storage schema, new tool, model execution or permission is added.

## Boundaries and instruction map

Retain root → `src/`, `tests/`, `website/` and `plans/` contracts. Link this plan
from the existing plans index; do not add instruction scopes or skill packages.
The panel displays observed records, never an agent-running percentage. Missing
history, different source revisions, old saved candidates and unknown writes
must remain distinct. Navigation/reading never checks consent or mutates source.

The local onboarding example uses a separate caller-owned marketplace name and
explicit collection/state paths, preserving the plugin's canonical package
identity. It does not register/install itself or grant global editing. Other
MCP Apps hosts use the same retained stdio runtime when their UI support permits;
plain clients retain structured tools. Public provider eligibility and native
operator acceptance remain Beads `i9-skills-knx` and `i9-skills-j0a`.

## Implementation and removal

1. Add a compact accessible saved-stage summary, derived only from selected
   activity and matching freshly inspected proposal state.
2. Show unconfirmed/changed/intent states before apparent success. Describe
   older proposals separately when they are not the latest review's candidate.
3. Document artifact preparation, a private local marketplace wrapper,
   supported registration, fresh-process checks, upgrades and safe removal.
   Keep data external and preserve all original selectors and permissions.
4. Update Changeset and equivalent EN/PT-BR/ES promotion. Test synthetic state
   transitions and render the real UI/site locally.
5. Validate Node24 after explicit npm ci, exact-commit independent review and
   required CI. A supported private-lab update may preserve existing selections;
   no direct installed-cache edit, real skill mutation or public rollout.

Revert the UI, docs and promotion together to remove this presentation. No state
migration or cleanup is needed. Do not prune proposals or change host profiles
as a rollback. Keep the release dependency issue753/#102 separate and unresolved
until its actual dependency remediation is verified.

## Acceptance and evidence

- Initial/loading history is not called absence; no result never implies the
  agent is running. Findings/no-change/blocked outcomes do not fabricate a diff.
- Pending, old-revision, saved-but-uninspected, applied, recovered, changed and
  unknown-write states remain truthful and never alter approval/action guards.
- Previous review completion cannot certify a newer proposal, or vice versa.
- A new consumer can follow explicit source-build and retained-plugin commands
  without machine-specific repository paths or a public marketplace assumption.
- Run targeted view/workflow/site tests, npm run check, npm run changeset:status,
  npm run package:check and git diff --check. Keep exact review/CI/install evidence
  in Beads/PR; native acceptance remains an explicit operator observation.
