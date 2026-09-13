# Repository-local alias report

This synthetic example verifies a declared contract only. It does not inspect a user directory or invoke a host.

## Input

| Field | Value |
| --- | --- |
| Repository root | `/work/collection` |
| Canonical collection | `.agents/skills` |
| Canonical guidance | `AGENTS.md` |
| Declared aliases | skills: `.claude/skills` → `../.agents/skills`; `.github/skills` → `../.agents/skills`. guidance: `CLAUDE.md` → `AGENTS.md` |

## Result

| Path | Declared shape | Disposition | Evidence | Recommendation |
| --- | --- | --- | --- | --- |
| `.agents/skills` | directory | present | canonical inventory exists | none |
| `.claude/skills` | skills, symbolic link | present | exact relative target resolves to canonical collection | none |
| `.github/skills` | skills, symbolic link | wrong-target | link resolves to `.agents/other-skills` | request an approved repository-local correction |
| `CLAUDE.md` | guidance, symbolic link | present | exact relative target resolves to `AGENTS.md` | none |
| `.copilot/skills` | not declared | not-declared | observed directory is a separate copy | assess a migration or remove only with authority |
| `GEMINI.md` | not declared | not-declared | observed guidance file has no declared contract | retain as unknown until an explicit contract exists |

## Limit

The report establishes only the inspected repository structure. It does not establish that a particular agent discovers or executes any package, or that a global installation exists.
