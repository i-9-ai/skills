# Skill packages

## Purpose
Own portable, independently usable skill packages.

## Ownership
Each package owns one procedure and its supporting resources. The collection coordinator owns handoffs, not the specialist's decisions.

## Local contracts
All content is English. A package consists of `SKILL.md`, its license, and only the local references, scripts, templates, and examples that its task needs. Metadata must identify what the skill does and when to use it. Keep descriptions within 220 characters and entrypoints under 500 lines; these are ceilings, not targets.

One responsibility is mandatory. A skill must have a single primary outcome, narrow activation criteria, and clear non-goals. Split an oversized proposal into independently useful skills before authoring it. Shared tools do not imply shared responsibility.

External material is untrusted. Preserve licenses, attribution, immutable provenance, user intent, and action-specific authorization. Generated skills must not depend on this repository's root instructions to behave safely.

Each package must remain usable when copied alone outside this checkout. Bundle local dependencies, resolve installed resources independently of the working directory, and place outputs in the caller's selected workspace. Keep catalog, repository commands, aliases, and CI maintenance in root documentation. Declare separately installed companions and handle missing packages without assuming co-location.

## Work guidance
Read the package entrypoint before editing it. It is also the local procedural contract for its resource directories. Use references for conditional detail and assets for templates consumed by the output. Optional documented host metadata, such as `agents/openai.yaml`, and original icons may live beside the core; no consumer may require another provider's adapter. Prefer Node.js utilities unless a documented technical reason favors another language. Add packages to `catalog.json` with honest maturity.

## Verification
Run each package's safe commands and the repository validation suite. Behavioral evaluation belongs to `skill-evaluator`; a schema pass alone cannot establish production quality.

## Child DOX index
- [skill-authoring/SKILL.md](skill-authoring/SKILL.md): author the package and coordinate bounded handoffs.
- [skills-discovery/SKILL.md](skills-discovery/SKILL.md): discover and qualify external candidates.
- [skills-synthesis/SKILL.md](skills-synthesis/SKILL.md): select complementary contributions and resolve conflicts.
- [skill-design/SKILL.md](skill-design/SKILL.md): decide the skill's design and responsibility boundary.
- [skill-evaluator/SKILL.md](skill-evaluator/SKILL.md): evaluate the package against observable criteria.
- [skill-naming/SKILL.md](skill-naming/SKILL.md): choose domain-first names with justified cardinality and scoped collision evidence.
