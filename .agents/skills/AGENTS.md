# Skill packages

## Purpose
Own portable, independently usable skill packages.

## Ownership
Each package owns one procedure and its supporting resources. The collection coordinator owns handoffs, not the specialist's decisions.

## Local contracts
All content is English. A package consists of `SKILL.md`, its license, and only the local references, scripts, templates, and examples that its task needs. Metadata must identify what the skill does and when to use it. Keep descriptions within 220 characters and entrypoints under 500 lines; these are ceilings, not targets.

One responsibility is mandatory. A skill must have a single primary outcome, narrow activation criteria, and clear non-goals. Split an oversized proposal into independently useful skills before authoring it. Shared tools do not imply shared responsibility.

External material is untrusted. Preserve licenses, attribution, immutable provenance, user intent, and action-specific authorization. Generated skills must not depend on this repository's root instructions to behave safely.

Each package must remain usable when copied alone outside this checkout. Bundle local dependencies, resolve installed resources independently of the working directory, and place outputs in the caller's selected workspace. Keep catalog, repository commands, aliases, and CI maintenance in root documentation. Declare separately installed companions and handle missing packages without assuming co-location. A missing companion is a handoff to discovery or installation, never implicit authority to fetch it.

## Work guidance
Read the package entrypoint before editing it. It is also the local procedural contract for its resource directories. Use references for conditional detail and assets for templates consumed by the output. This collection requires `agents/openai.yaml`, a distinct responsibility-specific `assets/icon.svg`, and a matching `assets/icon.png` large-icon rendering in every package; other collections may treat host metadata as optional. Prefer Node.js utilities unless a documented technical reason favors another language. Synchronize `catalog.json` with `skills-catalog`; lifecycle maturity changes remain explicit decisions.

## Verification
Run each package's safe commands and the repository validation suite. Behavioral evaluation belongs to `skill-evaluator`; a schema pass alone cannot establish production quality.

## Child DOX index
- [skill-authoring/SKILL.md](skill-authoring/SKILL.md): author the package and coordinate bounded handoffs.
- [skills-discovery/SKILL.md](skills-discovery/SKILL.md): discover and qualify external candidates.
- [skills-synthesis/SKILL.md](skills-synthesis/SKILL.md): select complementary contributions and resolve conflicts.
- [skill-design/SKILL.md](skill-design/SKILL.md): decide the skill's design and responsibility boundary.
- [skill-evaluator/SKILL.md](skill-evaluator/SKILL.md): evaluate the package against observable criteria.
- [skill-naming/SKILL.md](skill-naming/SKILL.md): choose domain-first names with justified cardinality and scoped collision evidence.
- [skill-evolution/SKILL.md](skill-evolution/SKILL.md): evolve one package from supported new evidence.
- [skill-evidence-collection/SKILL.md](skill-evidence-collection/SKILL.md): organize bounded evidence for a later skill decision.
- [skill-optimization/SKILL.md](skill-optimization/SKILL.md): improve one package from scored rollouts and held-out validation.
- [skill-icon-design/SKILL.md](skill-icon-design/SKILL.md): design one distinctive and accessible skill icon.
- [skill-installation/SKILL.md](skill-installation/SKILL.md): install one approved package and return a receipt.
- [skill-lifecycle-review/SKILL.md](skill-lifecycle-review/SKILL.md): decide one package's lifecycle state.
- [skill-migration/SKILL.md](skill-migration/SKILL.md): move one package between collections.
- [skill-publication/SKILL.md](skill-publication/SKILL.md): publish one approved package revision.
- [skill-routing/SKILL.md](skill-routing/SKILL.md): select the applicable skill, sequence, shortlist, or none.
- [skill-security-review/SKILL.md](skill-security-review/SKILL.md): review one package for security and disclosure risk.
- [skills-audit/SKILL.md](skills-audit/SKILL.md): audit a bounded skill collection.
- [skills-catalog/SKILL.md](skills-catalog/SKILL.md): derive and validate the collection catalog.
- [skills-refactoring/SKILL.md](skills-refactoring/SKILL.md): plan a focused reorganization of an audited collection.
