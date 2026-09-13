# Codex project adapter

## Purpose

Keep the optional Codex session adapter scoped to this checkout and derived from the canonical catalog.

## Contract

- `hooks.json` invokes only the repository-owned, read-only session-index command.
- Codex trust and hook enablement remain a user or host decision.
- The adapter never installs skills, changes repository files, or reads a personal skills directory.
- Hosts without this adapter use the same command as a manual fallback.
