---
title: "Generated session skill-index hook"
issue: "https://github.com/i-9-ai/skills/issues/13"
---

# Generated session skill-index hook

## Objective

Provide a compact, read-only session index generated from skills-catalog.json whenever a compatible host starts, resumes, clears, or compacts a session.

## Scope

Add one deterministic renderer, a Codex SessionStart adapter, a documented fallback for hosts without hooks, and regression coverage. Keep skills-catalog.json as the only catalog source.

## Exclusions

The hook does not install, invoke, update, publish, or modify skills. It does not trust itself, bypass host review, or inject package bodies.

## Authority boundaries

The host owns hook trust. The repository owns the renderer and adapter. A user or host policy remains required for every action beyond emitting context.

## Implementation sequence

1. Add a Node renderer that reads skills-catalog.json and emits a bounded index with the Skill Routing entry point, selected routes, status, and an on-demand lookup instruction.
2. Add the Codex SessionStart adapter and a manual fallback command that call the same renderer.
3. Cover normal, empty, invalid, and oversized catalog inputs; document the host trust step and remove the adapter to roll back.

## Acceptance criteria

- A compatible host loads the generated index on session lifecycle events.
- The output remains bounded and transparent about any truncation.
- The fallback is equivalent to the hook output.
- Local checks and the official validator pass on the resulting commit.

## Validation

Run the renderer and synthetic tests, npm run check, git diff --check, and inspect the hook configuration in a trusted Codex project.

## Rollback

Remove the hook adapter and renderer in one revert. skills-catalog.json and skill packages remain unchanged.
