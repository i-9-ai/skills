# Hook command contracts

## Purpose

Connect host lifecycle events to reusable repository capabilities without hiding installation or telemetry behavior.

## Ownership

This subtree owns lifecycle command adapters. Reusable discovery belongs to `context available-skills`; MCP owns protocol transport, not hook lifecycle.

## Local contracts

- `SessionIndexHookCommand` (`hook session-index`) invokes the available-skills service and writes compact context. The host matcher selects startup, resume, clear and compact events.
- Name host-specific operations explicitly: `hook codex session-config` and `hook codex verify`. Do not imply their JSON format works for other hosts.
- Configuration generation prints data. Verification compares configuration without executing it or proving host trust/enablement.
- Repository `.codex/hooks.json` registers only implemented, tested handlers. Preserve the SessionStart status message `Loading available skills overview`.
- PreToolUse proves a tool attempt, not a skill read or activation. Register future post-tool collection only after bounded payload parsing, success/read proof, correlation, deduplication, storage selection and failure behavior are tested.
- No automatic global installation, activation, network transport or prompt/body persistence. Metrics failures must not silently change task success or claim complete coverage.
- Link hooks to local services or MCP only where their responsibility requires it. Keep MCP stdout free of hook status messages and diagnostics.

## Work guidance

Use named host adapters around the portable core. Document unavailable events and coverage gaps explicitly; do not create nonfunctional registration scaffolding. New host formats need their own adapter tests.

## Verification

Run `node bin/index.mjs hook codex verify --file .codex/hooks.json`, the CLI integration suite and affected service/repository tests using disposable fixtures.

## Child DOX index

- [Session index command](session-index.ts): lifecycle entrypoint for the compact overview.
- [Codex configuration](codex/session-config.ts): prints the supported registration without writing files.
- [Codex verification](codex/verify.ts): compares a supplied configuration and reports that no hook ran.
- [Hook inventory](list.ts): distinguishes implemented registrations from planned telemetry.
