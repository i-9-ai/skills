# Expand the skill lifecycle collection

## Inaugural baseline consolidation

Consolidated into the initial skill-authoring pipeline before the first release. Retained as decision provenance only; this is not a separately delivered migration.

## Objective

Extend the original authoring pipeline into a complete, modular skill-management lifecycle without creating a broad, opaque skills-manager package.

## Scope

- Add focused packages for cataloging, routing, evidence collection, security review, lifecycle review, installation, publication, migration, auditing, refactoring, evolution, optimization, and icon design.
- Keep each package independently usable, with one responsibility, one primary output, explicit handoffs, scoped licenses, and portable Markdown contracts.
- Create the lifecycle policy for `pilot`, `stable`, and `deprecated` decisions.
- Add generated catalog metadata and validate it deterministically.

## Exclusions

- No generic agent orchestration or automatic subagent dispatch.
- No consumer migration, package publication, registry submission, or silent installation.
- No dependency on a named source-control host, CI service, approval vendor, or private Harness context.

## Authority boundaries

Lifecycle recommendations do not change catalog maturity, merge changes, install packages, publish releases, or create approval authority. A reviewer follows the target project's existing evidence and approval system when authorized; if none exists, it returns a portable approval record for a human decision.

## Validation

- Every package has a complete portable contract, license, and validated local assets.
- Catalog generation and checks agree with the canonical package tree.
- The collection's local validation and test suite pass.
- Official Agent Skills validation remains required in CI for the exact reviewed revision.

## Rollback

Revert individual package additions or the lifecycle policy in a reviewable change. A consumer remains unchanged unless a separate authorized installation or migration occurs.

## Execution status

Implemented in this PR: 19 focused packages, generated catalog, lifecycle policy, icon contract, and the associated structural and behavioral test coverage. Consumer pilots, official CI evidence for the merged revision, lifecycle promotion, and distribution remain separate post-merge gates.
