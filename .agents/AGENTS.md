# Agent-facing collection

## Purpose
Expose the repository's own canonical skill packages through the shared project discovery path.

## Ownership
Repository maintainers own this tree. Host integrations point here and do not maintain separate copies.

## Local contracts
All packages live in `.agents/skills`. Keep the core portable and English. Optional host metadata is advisory. Never place local credentials, agent sessions, caches, or private runtime state here.

## Work guidance
Read [skills/AGENTS.md](skills/AGENTS.md), then the selected package entrypoint. Edit only the canonical files; `.github/skills` and `.claude/skills` are repository aliases. Source material inside a package must not contain symlinks.

## Verification
Run the repository checks against the canonical tree. Declared root aliases must have exact relative targets and cannot redirect outside this repository.

## Child DOX index
- [skills/AGENTS.md](skills/AGENTS.md): single-responsibility packages and authoring contracts.
