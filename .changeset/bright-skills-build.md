---
"@i-9.ai/skills": patch
---

## Experimental distribution baseline

Introduce I-9 Skills, a collection of 24 focused, agent-agnostic packages for building and improving reusable agent skills. Each package owns one responsibility, one primary output, a scoped Apache-2.0 license, and an explicit handoff boundary. The package remains private and experimental; local checks do not establish native host compatibility or production quality.

### What the collection provides

- **Creation and quality:** discovery, authoritative domain research, synthesis, design, naming, authoring, evidence collection, independent evaluation, security review, and lifecycle decisions.
- **Collection operations:** catalog synchronization, routing, installation, publication, migration, audits, refactoring plans, evidence-backed evolution, and measured optimization.
- **Portable maturity decisions:** a lifecycle policy that uses each project's existing evidence and approval system, or returns a portable approval record when none exists.
- **Complete package interfaces:** portable `SKILL.md` contracts, local references and templates, optional host metadata, plus distinct SVG and PNG interface assets.
- **Public-readiness controls:** secret and personal-data hygiene, source provenance locks, full line-wrapped open-source and substantive proprietary license checks, deterministic catalog checks, and safe handling of external instructions and scripts.
- **Cross-host use:** the portable package contract is the baseline; Codex receives optional UI metadata while other hosts can use the same Markdown and local resources.

### Commands and automation

- `npm run check` validates the repository contract and its behavioral suite.
- `npm run ci:official` runs the official Agent Skills validation profile.
- `node bin/index.mjs catalog check --collection . --layout repository` detects catalog drift.
- `node bin/index.mjs catalog sync --collection . --layout repository` regenerates only the schema-version-`1` `skills-catalog.json`; lifecycle evidence is recorded separately. Add `--dry-run` to preview.
- Future installation selects an immutable reviewed revision and an explicitly authorized consumer scope. No installation or registry release follows from this baseline.

### Release-management foundation

Adopt Changesets as the single pending release-note source. Version preparation renders approved notes into `CHANGELOG.md`; GitHub Actions validates pending entries without creating tags, releases, or publications.
