# Codex project adapter

## Purpose

Keep the optional Codex session adapter scoped to this checkout and the unified CLI.

## Contract

- `hooks.json` invokes only the repository-owned, read-only session-index command.
- Codex trust and hook enablement remain a user or host decision.
- The adapter reads project and global skill metadata, with bounded discovery and canonical deduplication. It never installs skills or changes files; disable global discovery with the CLI's `--no-global` option.
- Keep the status text "Loading available skills overview". The matcher owns lifecycle selection; the reusable context command owns the overview.
- Automatic pre/post-tool metrics collection remains planned; rendering configuration does not enable a hook.
- Hosts without this adapter use the same command as a manual fallback.
