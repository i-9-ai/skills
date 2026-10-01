# Shared agent state and trustworthy skill telemetry

## Objective and authority

The user requests agent-independent telemetry and a visible shared default at
`~/.agents/skills-usage.db`, plus an audit of catalog and SQLite path references.
Use one configuration owner for global state. Preserve explicit overrides,
project/package resource ownership and portable skill procedures.

## Scope

- Centralize global skills, catalog and usage paths under the agent state root.
  Explicit `I9_SKILLS_USAGE_DB` selection wins. Native `PLUGIN_DATA` and each
  host-prefixed DATA variable are ignored because hosts may supply them
  automatically. Preserve a legacy store only by explicitly selecting its exact
  filename; no existing database is renamed, merged, reset or deleted.
  Read-only calls never create or migrate storage.
- Normalize supported native host events into the existing SQLite schema.
  Implement Codex observations only for bounded simple read commands whose
  successful output is proven, alongside Claude native Read. Add independently
  verified Gemini and Copilot adapters where their actual payloads establish
  identity and success. Unknown shapes stay unobserved and disclosed.
- Keep attempts, successful reads and caller-reported activation distinct.
  Preserve occurrence deduplication; never retain command bodies, prompts,
  transcripts, file contents or raw responses.
- Expose common CLI/MCP access and registration examples. Audit package references
  without replacing installed-package resources or caller-selected storage with
  a compulsory home dependency. Catalog defaults apply to global layout only.

## Boundaries and rollback

No automatic host installation, real home/database mutation, existing database
rename/reset, hidden migration, remote analytics or release publication.
An updated plugin uses the new default unless an explicit old path was configured;
document how to keep that path. Revert source/configuration changes to roll back,
preserving every database. Unsupported host tools use explicit normalized records.

## Validation

Use disposable HOME roots, native-shaped payload fixtures, shared-host queries,
deduplication, failures, unsupported commands, storage safety and concurrent writes.
Run npm ci/check, package verification, official skill validation for changed
packages, Changesets and whitespace checks. Independent review must match the
final commit. Synthetic hook execution is distinct from live native-agent evidence.
Close Beads tasks only with verified artifacts and accurately stated limits.

## Source contracts

Codex CLI 0.159.2 source commit ff6aec96948b70d94983af2641a6b67c94faeff5
and its hooks command schemas are the native reference. Consult official
Claude, Copilot and Gemini hook/tool documentation and record reviewed revisions
in the final operator guide. No third-party description defines a host contract.

Codex Bash PostToolUse supplies raw model-facing text, not an exit-code object.
Verify only literal bounded cat/sed selections and exact file/output agreement
after collection identity confinement. Gemini and Copilot hooks have no documented
native tool-call identifier: retain distinct timestamp-keyed attempts and reads,
disclose their unpaired correlation and possible same-timestamp deduplication gap.
