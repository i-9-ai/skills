---
name: example-skill
description: Use to produce one defined output for a recurring task; route adjacent tasks to their own skills.
license: Apache-2.0
---

# Example Skill

This is an authoring template, not an evaluated skill. Replace its examples with the target contract and include a full `LICENSE` in the generated package. Before accepting the package, run official `skills-ref validate` and behavioral evaluation; unavailable official validation blocks readiness. Remove this authoring note from the final task procedure.

## Responsibility and boundary

Define one primary outcome, its user, positive triggers, and nearby tasks excluded from this skill.

## Inputs and dependencies

Identify required and optional inputs, prerequisites, available capabilities, installation/credential requirements if any, and a fallback when they are absent.

Resolve bundled resources from the installed package and choose outputs in the caller's workspace. Declare companion dependencies explicitly. Verify the target project's actual commands and configuration instead of assuming the source collection is present.

Add optional `metadata` only for known authorship, useful tags, clear provenance, or a task-specific reasoning preference. Use string values and explain any custom field that should affect the procedure in the body; metadata does not grant tools or switch models.

## Procedure

Write only the instructions that change decisions or prevent likely mistakes. Link supporting resources where they become relevant.

## Tool policy

Define permitted actions, blocked actions, authorization boundaries, treatment of untrusted sources and secrets, and the evidence retained. Prior authorization persists; new external effects require scope for that action.

## Output and acceptance

Define the artifact, readiness criteria, behavioral cases, limitations, next handoff, iteration bound, and stopping condition. Include provenance and license obligations for reused material.

## Failure and rollback

Explain how to preserve existing work, report a blocker, and reverse only the changes made within this skill's authority.
