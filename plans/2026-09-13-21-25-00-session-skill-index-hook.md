---
title: "Generated session skill-index hook"
issue: "https://github.com/i-9-ai/skills/issues/13"
---

# Generated session skill-index hook

## Objective

Provide a compact, read-only session index of the selected skill collections whenever a compatible host starts, resumes, clears, or compacts a session. Explain how to inspect and choose a route without claiming that session initialization has made a task-specific decision.

## Scope

Maintain one deterministic renderer, host session adapters, a manual fallback, and regression coverage. The implemented project/global discovery reads current SKILL.md metadata and deduplicates canonical package paths; it does not create a second catalog or require a stale catalog to be refreshed. The bundled catalog interface supplies its separately verified catalog to the same renderer. This refinement completes issue #13 within the original acceptance boundary.

The renderer identifies any discovered `skill-routing` names as unverified entrypoint candidates. A shared name cannot establish package identity, and distinct canonical paths remain visible. Every displayed package retains its current description and source, with a bounded, safely quoted SKILL.md locator when it fits. Collection-relative locators are labeled explicitly; a locator that exceeds the display bound is omitted with an inspection instruction instead of being truncated into an unusable path.

The overview declares `available` only for readable, parsed metadata. Setup readiness, lifecycle state, host usability and activation remain unverified. Route selection is `unassessed` because a session event supplies neither a task nor a routing decision. The guidance explains the later `single`, `sequence`, `ambiguous` and `none` outcomes; it never substitutes `none` for an unevaluated decision. Candidate instructions and only the required linked resources are loaded by the caller on demand.

## Exclusions

The hook does not install, invoke, update, publish, or modify skills. It does not trust itself, bypass host review, inject package bodies, execute setup, read lifecycle evidence, or infer readiness and activation from names or metadata. Installed-host runtime changes are tracked separately in issue #20.

## Authority boundaries

The host owns hook trust. The repository owns the renderer and adapter. A user or host policy remains required for every action beyond emitting context.

## Implementation sequence

1. Keep the shared AvailableSkillsService renderer over the selected discovery or verified catalog input. Generate entrypoint candidates and available package rows from current evidence, with no fixed package allowlist.
2. Add the explicit metadata status, unassessed route selection, route-choice meanings and bounded on-demand locators. Keep existing entry-count, description, context and hook-output limits; retain coverage and omission notices when shrinking an overview.
3. Break identical-name/source ordering ties by canonical path so distinct package identities have stable order.
4. Keep `context available-skills` and `hook session-index` on the same rendering path; compare the exact context inside each supported host envelope.
5. Cover current metadata changes, empty/malformed input, name collisions, untrusted text, long locators and context limits with disposable fixtures. Document host trust and keep installed-runtime verification separate.

## Acceptance criteria

- A compatible host loads the generated index on session lifecycle events.
- The output remains bounded and transparent about any truncation.
- The fallback is equivalent to the context inside each supported hook envelope for the same collections and limits.
- The output exposes entrypoint candidates, current package purposes, metadata-only availability, unassessed route selection and how to inspect details. Duplicate routing names never acquire a preferred identity by name alone.
- Added, removed and edited source metadata changes the next overview without writes or automatic catalog maintenance; malformed packages produce incomplete-coverage evidence.
- Existing description control-character handling is preserved. Locators cannot introduce new context lines or Markdown syntax, and oversized locators are disclosed without emitting partial paths.
- Local checks and the official validator pass on the resulting commit.

## Validation

Run the AvailableSkillsService and SkillDiscoveryRepository unit suites, available-skills and host-hooks CLI integration suites, and the installed catalog overview regression suite under Node.js 24+. Run targeted formatting, type checking, Changesets status and git diff --check, then the complete repository and official-validation checks on the integrated review commit. Preserve exact output-parity evidence and distinguish these structural/runtime fixture checks from native host execution and semantic skill evaluation.

## Rollback

Revert the renderer, deterministic ordering, tests and matching release note to remove this refinement; existing adapters keep their prior context behavior. Remove the adapters and renderer together to roll back the original capability. Catalogs, skill packages, host registration and installed configuration remain unchanged.
