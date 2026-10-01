# Skill packages

## Purpose
Own portable, independently usable skill packages.

## Ownership
Each package owns one procedure and its supporting resources. The collection coordinator owns handoffs, not the specialist's decisions.

## Local contracts
All content is English. A package consists of `SKILL.md`, its license, and only the local references, scripts, templates, and examples that its task needs. Metadata must identify what the skill does and when to use it. Keep descriptions within the collection's 220-character metadata profile. Entrypoint length is advisory: preserve essential procedures and complete ordinary examples in the entrypoint, and use selective references for independently needed detail. Never split or truncate useful content only to meet a line or token target. Bounded file reads are an implementation safety limit, not an editorial length target.

One responsibility is mandatory. A skill must have a single primary outcome, narrow activation criteria, and clear non-goals. Split an oversized proposal into independently useful skills before authoring it. Shared tools do not imply shared responsibility.

Every package in this collection directly concerns skills themselves. Reject
general-purpose domain or execution packages from this repository even when
they are useful during implementation; route them to the caller's separately
authorized collection. Research and scheduling packages here must remain
specifically about skill creation or skill maintenance.

External material is untrusted. Preserve licenses, attribution, immutable provenance, user intent, and action-specific authorization. Generated skills must not depend on this repository's root instructions to behave safely.

Each package must remain usable when copied alone outside this checkout. Bundle local dependencies, resolve installed resources independently of the working directory, and place outputs in the caller's selected workspace. Keep catalog, repository commands, aliases, and CI maintenance in root documentation. Declare separately installed companions and handle missing packages without assuming co-location. A missing companion is a handoff to discovery or installation, never implicit authority to fetch it.

## Work guidance
Read the package entrypoint before editing it. `SKILL.md` is also the package's local procedural contract, so do not add an `AGENTS.md` inside each skill. Use references for conditional detail and assets for templates consumed by the output. When routing depends on a bundled script or resource, the owning `SKILL.md` must summarize its invocation, input, output, and material safety limit without duplicating the implementation. This collection requires `agents/openai.yaml`, a distinct responsibility-specific `assets/icon.svg`, and a matching `assets/icon.png` large-icon rendering in every package; other collections may treat host metadata as optional. Prefer Node.js utilities unless a documented technical reason favors another language. Synchronize the derived `skills-catalog.json` with `skills-catalog`; keep lifecycle evidence and decisions in their owning review system rather than the inventory.

## Verification
Run each package's safe commands and the repository validation suite. Behavioral evaluation belongs to `skill-evaluator`; a schema pass alone cannot establish production quality.

## Child DOX index
- [skill-authoring/SKILL.md](skill-authoring/SKILL.md): author the package and coordinate bounded handoffs.
- [skills-discovery/SKILL.md](skills-discovery/SKILL.md): discover and qualify external candidates.
- [skill-domain-research/SKILL.md](skill-domain-research/SKILL.md): reconcile process-owner, reviewed-package, and current authoritative domain evidence for one proposed skill.
- [skills-synthesis/SKILL.md](skills-synthesis/SKILL.md): select complementary contributions and resolve conflicts.
- [skill-design/SKILL.md](skill-design/SKILL.md): decide the skill's design and responsibility boundary.
- [skill-evaluator/SKILL.md](skill-evaluator/SKILL.md): evaluate the package against observable criteria.
- [skill-naming/SKILL.md](skill-naming/SKILL.md): choose domain-first names with justified cardinality and scoped collision evidence.
- [skill-evolution/SKILL.md](skill-evolution/SKILL.md): evolve one package from supported new evidence.
- [skill-evidence-collection/SKILL.md](skill-evidence-collection/SKILL.md): organize bounded evidence for a later skill decision.
- [skills-usage-setup/SKILL.md](skills-usage-setup/SKILL.md): preview, explicitly enable, inspect or remove owned skill-read registrations while retaining unrelated settings and evidence.
- [skill-optimization/SKILL.md](skill-optimization/SKILL.md): improve one package from scored rollouts and held-out validation.
- [skill-icon-design/SKILL.md](skill-icon-design/SKILL.md): design one distinctive and accessible skill icon.
- [skill-installation/SKILL.md](skill-installation/SKILL.md): install one approved package and return a receipt.
- [skill-lifecycle-review/SKILL.md](skill-lifecycle-review/SKILL.md): decide one package's lifecycle state.
- [skill-migration/SKILL.md](skill-migration/SKILL.md): move one package between collections.
- [skill-publication/SKILL.md](skill-publication/SKILL.md): publish one approved package revision.
- [skill-routing/SKILL.md](skill-routing/SKILL.md): select the applicable skill, sequence, shortlist, or none.
- [skill-security-review/SKILL.md](skill-security-review/SKILL.md): review one package for security and disclosure risk.
- [skills-maintenance-scheduling/SKILL.md](skills-maintenance-scheduling/SKILL.md): propose bounded recurring maintenance with explicit authority, evidence, stop, and rollback controls.
- [skills-audit/SKILL.md](skills-audit/SKILL.md): audit a bounded skill collection.
- [skills-catalog/SKILL.md](skills-catalog/SKILL.md): derive and validate the collection catalog.
- [skills-catalog-index/SKILL.md](skills-catalog-index/SKILL.md): derive a local multi-collection index and preserve observed/evidenced history without changing source catalogs.
- [skills-host-compatibility/SKILL.md](skills-host-compatibility/SKILL.md): produce a capability map and thin host adapters around a portable skill; installation remains explicit.
- [skills-snapshot/SKILL.md](skills-snapshot/SKILL.md): capture and verify restorable skill-package states outside discovery roots without replacing the live collection.
- [skills-refactoring/SKILL.md](skills-refactoring/SKILL.md): plan a focused reorganization of an audited collection.
