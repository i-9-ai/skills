---
"i9-skills": patch
---

## First public-ready release

Introduce I-9 Skills, a collection of 19 focused, agent-agnostic packages for building and improving reusable agent skills. Each package owns one responsibility, one primary output, a scoped Apache-2.0 license, and an explicit handoff boundary.

### What the collection provides

- **Creation and quality:** discovery, synthesis, design, naming, authoring, evidence collection, independent evaluation, security review, and lifecycle decisions.
- **Collection operations:** catalog synchronization, routing, installation, publication, migration, audits, refactoring plans, evidence-backed evolution, and measured optimization.
- **Portable maturity decisions:** a lifecycle policy that uses each project's existing evidence and approval system, or returns a portable approval record when none exists.
- **Complete package interfaces:** portable `SKILL.md` contracts, local references and templates, optional host metadata, plus distinct SVG and PNG interface assets.
- **Public-readiness controls:** secret and personal-data hygiene, source provenance locks, scoped licenses, deterministic catalog checks, and safe handling of external instructions and scripts.
- **Cross-host use:** the portable package contract is the baseline; Codex receives optional UI metadata while other hosts can use the same Markdown and local resources.

### Commands and automation

- `npm run check` validates the repository contract and its behavioral suite.
- `npm run ci:official` runs the official Agent Skills validation profile.
- `node .agents/skills/skills-catalog/scripts/catalog_tools.mjs check .` detects catalog drift.
- `node .agents/skills/skills-catalog/scripts/catalog_tools.mjs sync .` regenerates only `catalog.json` while preserving lifecycle state.
- `npx skills@1.5.26 add https://github.com/i-9-ai/skills/tree/94107e0a4b3f8712f2e62fd48d7c27b62fee4441 --global --skill '*' --yes` installs the reviewed collection revision into a user-level Skills scope after publication.

### Release-management foundation

Adopt Changesets as the single pending release-note source. Version preparation renders approved notes into `CHANGELOG.md`; GitHub Actions validates pending entries without creating tags, releases, or publications.
