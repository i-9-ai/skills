# Strengthen the portable authoring contract

## Inaugural baseline consolidation

Consolidated into the initial skill-authoring pipeline before the first release. Retained as decision provenance only; this is not a separately delivered migration.

## Objective

Make every newly authored skill explicit about its selection boundary, context sources, handoffs, and automation authority without imposing a host-specific runtime.

## Scope

- Extend the authoring template and generated scaffold with `When to use`, `When not to use`, `Context sources`, `Handoffs`, and conditional `Automation authority` sections.
- Document the same rules in the public authoring standard.
- Add regression coverage that confirms a new scaffold contains these sections.

## Exclusions

- No mandatory scheduler, subagent API, model configuration, GitHub/GitLab workflow, or product-specific context.
- No automatic invocation, installation, approval, publication, or external mutation from a handoff or schedule.

## Authority boundaries

Skills load product, customer, personal, and environment-specific context only from the caller's authorized workspace or declared reference. A handoff recommends a capability and carries an artifact; it never grants authority or assumes the target is available. Automation is descriptive until an authorized host executor acts.

## Validation

- The scaffold test verifies the required contract sections.
- Existing portable-package checks and documentation link validation pass.
- The resulting template remains provider-neutral and package-self-contained.

## Rollback

Revert the template, scaffold, standards, and test update together. Existing packages remain unchanged until they are deliberately revised.

## Execution status

Implemented in this PR and covered by the scaffold regression test. The policy provides a reusable contract for future packages; it does not retroactively add automation or authority to existing skills.
