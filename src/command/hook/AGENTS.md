# Hook command contracts

## Purpose

Connect host lifecycle events to reusable repository capabilities without hiding installation or telemetry behavior.

## Ownership

This subtree owns lifecycle command adapters. Reusable discovery belongs to `context available-skills`; MCP owns protocol transport, not hook lifecycle.

## Local contracts

- `SessionIndexHookCommand` (`hook session-index`) invokes the available-skills service and writes compact context. The host matcher selects startup, resume, clear and compact events.
- Select each verified host explicitly with `hook session-config --host` and `hook verify --host`. HostHookConfiguration owns the Codex, Claude, Copilot, Gemini, Antigravity and Hermes registrations and their distinct output envelopes; do not imply their JSON formats are interchangeable. HostSessionInputService gates first invocations where startup is not an injectable event.
- Configuration generation prints data. Verification compares configuration without executing it or proving host trust/enablement. Optional telemetry-enable requires --write and the exact --reviewed-registration digest from its runtime-bound preview; telemetry-disable removes only receipt-owned entries. Previews and telemetry-status are read-only, and neither operation opens or erases evidence storage.
- Repository `.codex/hooks.json` registers only implemented, tested handlers. Preserve the SessionStart status message `Loading available skills overview`.
- PreToolUse proves a tool attempt, not a skill read or activation. ClaudeTelemetryAdapter maps native successful Read events only; raw bodies never enter storage. Further adapters require verified success/occurrence contracts and their own payload tests.
- No automatic global installation, activation, network transport or prompt/body persistence. Metrics failures must not silently change task success or claim complete coverage.
- Link hooks to local services or MCP only where their responsibility requires it. Keep MCP stdout free of hook status messages and diagnostics.

## Work guidance

Use named host adapters around the portable core. Document unavailable events and coverage gaps explicitly; do not create nonfunctional registration scaffolding. New host formats need their own adapter tests.

## Verification

Run `node bin/index.mjs hook verify --host codex --file .codex/hooks.json`, the CLI integration suite and affected service/repository tests using disposable fixtures.

## Child DOX index

- [Session index command](SessionIndexHookCommand.ts): lifecycle entrypoint for the compact overview.
- [Host configuration](SessionConfigCommand.ts): prints the selected registration without writing files.
- [Host verification](HookVerifyCommand.ts): compares a supplied configuration and reports that no hook ran.
- [Hook inventory](HookListCommand.ts): distinguishes implemented registrations and observation coverage from unsupported host mappings.
- [Read observation](HookObserveCommand.ts): bounded native event ingress and nonblocking diagnostics.
- [Observation registration](TelemetryConfigCommand.ts): explicit selected collection/database registration without host writes.
- [Optional enable](TelemetryEnableCommand.ts): preview or merge owned telemetry entries into an explicit settings file using an available runtime.
- [Registration status](TelemetryStatusCommand.ts): inspect exact owned entries and runtime availability without opening evidence storage.
- [Optional disable](TelemetryDisableCommand.ts): remove only exact owned entries after explicit application; retain unrelated settings and evidence.
