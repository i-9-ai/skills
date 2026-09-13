---
name: example-skill
description: Use to produce one defined output for a recurring task; route adjacent tasks to their own skills.
license: Apache-2.0
---

# Example Skill

This is an authoring template, not an evaluated skill. Replace its examples with the target contract and include a full `LICENSE` in the generated package. Before accepting the package, run official `skills-ref validate` and behavioral evaluation; unavailable official validation blocks readiness. Remove this authoring note from the final task procedure.

## Responsibility and boundary

Define one primary outcome, its user, positive triggers, and nearby tasks excluded from this skill.

## When to use

List the observable request patterns that should select this skill.

## When not to use

List adjacent requests that should select another capability or no skill. State the handoff boundary without duplicating the other procedure.

## Inputs and dependencies

Identify required and optional inputs, prerequisites, available capabilities, installation/credential requirements if any, and a fallback when they are absent.

Resolve bundled resources from the installed package and choose outputs in the caller's workspace. Declare companion dependencies explicitly. Verify the target project's actual commands and configuration instead of assuming the source collection is present.

## Context sources

Identify the source of truth for each decision. Load product, customer, personal, or environment-specific context from the caller's authorized workspace or declared reference; never embed it in a distributed package. Keep uncertain evidence labeled as a hypothesis.

Add optional `metadata` only for known authorship, useful tags, clear provenance, or a task-specific reasoning preference. Use string values and explain any custom field that should affect the procedure in the body; metadata does not grant tools or switch models.

## Procedure

Write only the instructions that change decisions or prevent likely mistakes. Link supporting resources where they become relevant.

## Tool policy

Define permitted actions, blocked actions, authorization boundaries, treatment of untrusted sources and secrets, and the evidence retained. Prior authorization persists; new external effects require scope for that action.

## Automation authority (when applicable)

For a hook, watcher, daemon, scheduler, or background loop, state its execution mode, trigger, real executor, side-effect authority, evidence owner, stop condition, and rollback path. Remove this section when the skill does not describe automation. A schedule may propose or request approval; it never creates authority to change, publish, install, or approve work.

## Handoffs

For every conditional handoff, state the trigger, target capability, artifact passed, expected result, and caller action after return. A handoff recommends or requests a separate capability; it does not invoke that capability, install it, grant authority, or assume it is available. If the target is unavailable, return the completed artifact with a clear blocked next action.

## Output and acceptance

Define the artifact, readiness criteria, behavioral cases, limitations, iteration bound, and stopping condition. Include provenance and license obligations for reused material.

## Failure and rollback

Explain how to preserve existing work, report a blocker, and reverse only the changes made within this skill's authority.
