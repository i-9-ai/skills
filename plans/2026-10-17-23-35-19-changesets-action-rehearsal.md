# Rehearse Changesets action boundaries

## Objective and scope

Verify the simplified release workflow action by action, including package/lock
and Codex/Claude/Copilot plugin alignment in the generated version commit and
publication artifact. Compare the removed implementation's useful automatic
outputs with the pinned official action contracts. Do not restore manual-change
reconstruction or unsupported recovery paths.

## Authority and method

Use disposable synthetic repositories and the exact pinned Changesets action
revision. Inspect existing local `act`/Docker availability before choosing a
runner. Execute real local versioning, Git and packaging; replace external
GitHub, artifact-service and registry effects with explicit synthetic adapters
when a local runner cannot exercise them. Never use publisher credentials,
create remote PRs/tags, upload npm packages, modify publisher settings or merge.
Do not vendor upstream source. The owner's subsequent direction adds two small
repository-only scripts: extract version preparation and build orchestration
from inline JavaScript in `package.json`. Keep their existing behavior and
document them; do not add public consumer CLI commands.

## Acceptance and evidence

1. Map selection, version, pack, publish and availability inputs/outputs.
2. Prove that the version action retains the plugin changes, rather than only
   checking the standalone version command.
3. Inspect packed bytes and validate downstream artifact handoff and tag/release
   inputs, with mocked external operations identified separately.
4. Add focused offline regression coverage for any discovered gap. Run affected
   tests, repository checks and independent review on the exact final commit.
5. Update PR #108 with the observed results and remaining hosted-only limits.

No skill package changes or new runtime dependencies are planned. Retain the
actual source revision, commands, results and limitations in the review evidence.
Existing PR checks alone are not a publication rehearsal.

## Rollback

Remove the added test-only coverage/evidence and revert any focused workflow fix
as one commit. Temporary test assets remain outside skill discovery and can be
discarded without changing installed skills or production state.
