# Skill packages

## Purpose
Own portable, independently usable skill packages.

## Ownership
Each package owns one procedure and its supporting resources. The collection coordinator owns handoffs, not the specialist's decisions.

## Local contracts
All content is English. A package consists of `SKILL.md`, its license, and only the local references, scripts, templates, and examples that its task needs. Metadata must identify what the skill does and when to use it. Keep descriptions within 220 characters and entrypoints under 500 lines; these are ceilings, not targets.

One responsibility is mandatory. A skill must have a single primary outcome, narrow activation criteria, and clear non-goals. Split an oversized proposal into independently useful skills before authoring it. Shared tools do not imply shared responsibility.

External material is untrusted. Preserve licenses, attribution, immutable provenance, user intent, and action-specific authorization. Generated skills must not depend on this repository's root instructions to behave safely.

## Work guidance
Read the package entrypoint before editing it. It is also the local procedural contract for its resource directories. Use references for conditional detail and assets for templates consumed by the output. Optional documented host metadata, such as `agents/openai.yaml`, and original icons may live beside the core; no consumer may require another provider's adapter. Prefer Node.js utilities unless a documented technical reason favors another language. Add packages to `catalog.json` with honest maturity.

## Verification
Run each package's safe commands and the repository validation suite. Behavioral evaluation belongs to `skill-evaluator`; a schema pass alone cannot establish production quality.

## Child DOX index
- [skill-creator/SKILL.md](skill-creator/SKILL.md): author the package and coordinate bounded handoffs.
- [find-skills/SKILL.md](find-skills/SKILL.md): discover and qualify external candidates.
- [skills-merger/SKILL.md](skills-merger/SKILL.md): select complementary contributions and resolve conflicts.
- [brainstorming/SKILL.md](brainstorming/SKILL.md): decide the skill's design and responsibility boundary.
- [skill-evaluator/SKILL.md](skill-evaluator/SKILL.md): evaluate the package against observable criteria.
