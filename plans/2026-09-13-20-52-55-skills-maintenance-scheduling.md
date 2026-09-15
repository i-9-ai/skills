# Skills maintenance scheduling

Related issue: [#15](https://github.com/i-9-ai/skills/issues/15)

## Objective

Add one portable skill that turns an approved maintenance goal for a bounded skill collection into a reviewable maintenance-scheduling proposal. It must use an existing host scheduler only when the caller explicitly authorizes configuration; otherwise it returns a portable schedule contract for the local approval system.

## Scope

- Add `skills-maintenance-scheduling` as a self-contained package with English instructions, Apache-2.0 license, OpenAI UI metadata, and distinct SVG and PNG icons.
- Define a bounded schedule proposal: target collection, cadence, trigger, route, execution mode, owner, evidence destination, stop condition, rollback, and approval gate.
- Detect and describe an existing local scheduling and approval mechanism without requiring a named provider.
- Recommend a maintenance route using existing collection skills, such as `skills-audit`, `skill-evidence-collection`, `skill-evolution`, `skill-evaluator`, and `skill-lifecycle-review`.
- Add catalog metadata, documentation, tests, and one Changeset entry for the new public package.

## Exclusions

- Do not create recurring automations, edit a host scheduler, trigger subagents, run an audit, modify skills, install packages, publish releases, or approve changes by default.
- Do not make GitHub Actions, Codex, Claude, GitLab, or any other host a required dependency.
- Do not become a generic automation framework or replace routing, evaluation, lifecycle review, or approval systems.

## Design

The package owns one output: a maintenance-scheduling proposal. Its first decision is whether a recurring maintenance need exists. If not, it returns `none` with the reason. If it does, it identifies the project-local scheduler and approval system when they exist, then proposes the least-frequent cadence that supports the stated risk and evidence freshness.

The proposal is advisory unless the caller separately authorizes configuration. An authorized adapter may translate the proposal to a host-native scheduler, but the portable core records the real executor and all side-effect boundaries. Each scheduled run proposes work and collects evidence; it never silently accepts, merges, publishes, installs, or changes a skill.

## Acceptance criteria

- The package clearly distinguishes scheduling proposals from execution and authorization.
- Positive cases cover an existing scheduler, no local scheduler, and an explicit request to configure one.
- Negative cases reject unbounded targets, automatic approval, secret-bearing schedules, and attempts to treat a cadence as authorization.
- The schedule contract includes trigger, executor, authority, evidence owner, stopping rule, and rollback path.
- The package passes collection checks, official validation, and focused behavior tests without relying on a source-checkout path.

## Verification

Run the catalog synchronizer, `npm run check`, `npm run ci:official`, `npm run changeset:status`, `git diff --check`, and the focused tests added for the scheduling contract. Inspect the package alone from an unrelated working directory.

## Rollback

Revert the dedicated package, catalog entry, documentation, tests, and Changeset together. No external scheduler state may exist unless a later, separately authorized configuration action created it.
