# Portable planning protocol

## Purpose

Make material repository changes deliberate and reviewable across agent hosts. This protocol uses a host's planning mode when available, but does not depend on a proprietary mode, command, or configuration file.

## Activation

When a request adds a material dependency, workflow, external integration, release mechanism, public-facing capability, broad structural change, or irreversible operation:

1. Ask the host to enter its native planning mode if it has one.
2. If no native planning mode exists, create a focused plan in `plans/` before implementation.
3. Treat the plan as the durable contract in both cases. A host mode can guide reasoning, but it is not the source of record.

Routine, reversible, low-impact fixes may proceed without a plan when their scope and validation are obvious. Emergency remediation may proceed first only when delay creates material harm; record the plan and evidence immediately afterward.

## Required plan contents

Keep the plan proportionate, but include:

- objective and user outcome;
- scope and explicit exclusions;
- affected packages, workflows, dependencies, and external systems;
- authority boundaries and actions that remain prohibited without separate approval;
- implementation sequence and rollback or removal path;
- validation commands and observable acceptance criteria;
- evidence that must be retained for review.

## Execution boundary

Do not treat a plan as publication, deployment, installation, release, or permission to alter external state. Recheck the current repository state before implementation, keep unrelated changes out of scope, and update the plan if a material assumption changes.

## Host portability

Agent products use different names and mechanisms for planning. Some expose an explicit planning mode; others use instructions, tasks, or no mode at all. The protocol therefore names the capability rather than a vendor command. A portable skill should say “use the host planning mode when available, otherwise follow this protocol,” then link to the durable plan.
