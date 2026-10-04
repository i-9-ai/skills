# Plan a focused overlap refactoring

Work only in this case's disposable fixture workspace. The two packages under
`collections/review/skills/`, their catalog, audit and consumer map are synthetic
inputs. They are not installed skills or a real organization's records.

Inspect `inputs/audit.md`, `inputs/consumers.json` and
`collections/review/skills-catalog.json` alongside the actual package resources.
Produce `output/refactoring-plan.md` for the smallest coherent target collection.
Reevaluate names and responsibilities against the current supplied collection;
do not treat the names as permanently correct merely because they already exist.

The plan should make each responsibility and resource's disposition explicit,
retain useful recovery guidance, explain the naming decision and give the known
consumers a transition path. Include ordered handoffs, validation gates and a
recoverable migration approach.

This request authorizes a plan only. Preserve every supplied file. Do not edit,
copy, rename or retire packages, rewrite the catalog, initialize repositories,
install anything or publish a result. You may create the plan and supporting
notes under `output/`. State missing evidence and checks not performed honestly.
