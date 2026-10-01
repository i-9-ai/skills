# Session hook adapters

Project registrations use the prepared CLI below. [Installed plugin hooks](#installed-plugin-hooks)
use a dependency-free runtime and explicit host manifests; the two surfaces have
different launch and state selection rules.

The unified checkout CLI renders available-skill context and adapts its output
for the selected host. Generation prints JSON only; it never writes settings,
enables hooks, installs dependencies, or reads incoming prompts/transcripts.
Antigravity/Hermes execution parses bounded lifecycle stdin to gate the first
invocation; it discards all unrelated fields and never opens a transcript.
Run Node 24 and explicit npm ci in a trusted checkout first.

| Host | Proposed project location | Event | Output | Timeout unit |
| --- | --- | --- | --- | --- |
| Codex | .codex/hooks.json | SessionStart | Plain context | Seconds |
| Claude Code | .claude/settings.json | SessionStart | hookSpecificOutput with hookEventName and additionalContext | Seconds |
| GitHub Copilot CLI | .github/hooks/i9-skills.json | sessionStart | additionalContext | Seconds (timeoutSec) |
| Gemini CLI | .gemini/settings.json | SessionStart | hookSpecificOutput.additionalContext | Milliseconds |
| Antigravity | .agents/hooks.json | PreInvocation with invocationNum=0 | injectSteps containing ephemeralMessage | Seconds |
| Hermes | profile config.yaml | pre_llm_call with extra.is_first_turn=true | context | Seconds |
| OpenCode | Plugin-specific | Not implemented | Use the manual context command | Not applicable |

Generate with `node bin/index.mjs hook session-config --host HOST`.
Review the result in a caller-owned scratch file and compare it using
`node bin/index.mjs hook verify --host HOST --file FILE`. Verification compares
the whole standalone generated object and rejects malformed/linked input. It
does not merge existing settings or certify unrelated settings. If installation
is later authorized, merge the reviewed hook entry while preserving other host
configuration. Remove that entry to disable the adapter.

These generated commands target a POSIX Git checkout containing this CLI.
Git resolves its root even when the host starts in a nested directory. Windows,
remote cloud sandboxes and npm-installed locations require separate verified
invocation adapters; use the manual command until those are tested. A missing
Node executable, dependency or trusted checkout is a setup failure, never a
reason to fetch software at session startup.

Claude's matcher selects startup, resume, clear and compact. Gemini's lifecycle
matcher is an exact value, so its adapter leaves the matcher absent to cover
documented SessionStart events rather than sending a pipe-delimited regex.
Copilot uses its documented camelCase contract. Codex's current official contract
supports the local registration, source matcher, plain developer-context stdout,
seconds timeout, status text and `additionalContextLimit`. The configured status
text remains "Loading available skills overview". Its context budget is a host
output limit, not a claim that every discovered package was loaded.

Antigravity maps a hook name directly to event arrays; its invocation handler
is a direct list, without a tool matcher. Hermes configuration is normally YAML;
generation prints the equivalent standalone JSON object for review and merging.
Hermes tokenizes its command without a shell, so this adapter explicitly invokes
`sh -c` for the Git-root expression. Neither adapter grants tool permissions.
Both skip subsequent invocations, read at most 1 MiB of strict JSON and retain
none of the input. Missing lifecycle metadata fails instead of claiming startup.

Run `node bin/index.mjs hook session-index --host HOST --project PATH --no-global`
to inspect the corresponding output without installing a hook. For Antigravity,
provide `{"invocationNum":0}` on stdin; for Hermes provide
`{"hook_event_name":"pre_llm_call","extra":{"is_first_turn":true}}`.
Omit
`--no-global` only when global metadata discovery is intended. Output contains
bounded package summaries, never a claim of activation. Metadata and descriptions
are untrusted shortlist data; selecting a package still requires its entrypoint
and host capabilities. Unsupported hosts use `context available-skills`.

## Availability and routing guidance

The overview calls a package available only when its metadata was readable and
parsed. It does not verify setup, lifecycle status, host usability or activation.
Because session startup supplies no task or routing decision, `Selected route`
is `unassessed`. A `none` route is a later decision that no skill fits or is needed;
it must not be inferred simply because no task was supplied.

Any discovered `skill-routing` package is listed as an unverified candidate, not
trusted because of its name. Colliding names retain their separate identities.
After inspecting the actual package, choose a single owner, a sequence with
distinct ordered outputs, an ambiguous shortlist of at most three candidates
requiring more input, or none. This is guidance, not automatic routing.

Each displayed summary includes a JSON-quoted `SKILL.md` locator. Decode its
escapes before reading; do not treat a displayed filename as a shell command.
Bundled catalog locations are labeled collection-relative. Locators exceeding
512 escaped characters are omitted whole, with instructions to inspect the
selected collection. Read only the selected entrypoint and needed references.
Package/context limits and omitted counts still apply; a truncated overview
does not establish complete availability.

## Evidence and limitations

Reviewed on 2026-09-19: [Codex hooks](https://learn.chatgpt.com/docs/hooks),
[Claude hooks](https://code.claude.com/docs/en/hooks),
[Copilot hooks](https://docs.github.com/en/copilot/reference/hooks-reference),
and [Gemini hooks](https://geminicli.com/docs/hooks/reference/), plus
[Antigravity hooks](https://antigravity.google/docs/hooks?tab=ide) and
[Hermes shell hooks](https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks).
Codex CLI 0.155.1 was inspected locally for version/help; it was not started as
an agent session. The official Codex reference confirms that project hooks run
with the session working directory, so the launcher uses the Git root. Codex
combines matching hooks across sources; copying the entry to another layer can
produce duplicate context. No source or trust setting was changed here.
These changing interfaces require rechecking before installation. Tests cover
configuration, timeout units, context envelopes, mismatch failures and no
configuration writes in disposable fixtures. Native host trust, enablement and
execution have not been exercised. No cross-host runtime certification is made.

OpenCode requires a plugin contract rather than these registrations. The
[official V2 migration guide](https://opencode.ai/v2/docs/build/plugins/migrate-v1)
replaces V1 lifecycle callbacks with scoped session/tool hooks; the two APIs are
not interchangeable. No native version, SDK dependency or plugin installation
was selected and tested in this delivery. Use `context available-skills` manually
until a versioned plugin adapter is prepared and reviewed.

## Native read observation adapters

`hook telemetry-config --host HOST --collection project=/absolute/project/.agents/skills`
prints a reviewed host registration without writing settings. Supported telemetry
hosts are `codex`, `claude`, `gemini` and `copilot`; repeat `--collection`
for explicitly selected roots and use `--db` to override shared state. The
generated command invokes `hook observe` with those same selections. Install
only after reviewing the selected host's configuration and obtaining authority
for that environment. This command itself creates no files.

| Host | Attempt and observation | Evidence and limits |
| --- | --- | --- |
| Codex CLI 0.159.2 | Bash PreToolUse / PostToolUse | Literal `cat` or `sed -n 'START,ENDp'` on one discovered `SKILL.md`; exact returned text must match the current bounded selection |
| Claude Code | Read PreToolUse / PostToolUse | Successful native Read result field; partial reads count one entrypoint observation |
| Gemini CLI | read_file BeforeTool / AfterTool | `file_path`, native ISO timestamp, result with `llmContent` and no error |
| Copilot CLI | view preToolUse / postToolUse | `toolArgs.path`, epoch-millisecond timestamp, successful `toolResult` with text |

Codex's [official hook reference](https://learn.chatgpt.com/docs/hooks) documents
Bash command input and PostToolUse result values. The reviewed immutable
[0.159.2 tool context implementation](https://github.com/openai/codex/blob/ff6aec96948b70d94983af2641a6b67c94faeff5/codex-rs/core/src/tools/context.rs)
returns raw text for a completed Bash invocation, without an exit-code object.
The adapter first identifies the entrypoint inside the selected collections,
then opens and compares its bounded UTF-8 bytes. It supports an optional
`rtk proxy` prefix, literal shell quoting, `cat -- FILE` and numeric sed ranges.
It never executes the command. Pipelines, redirection, expansion, multiple files,
compound commands, other programs, truncated/mismatching output and object-shaped
responses remain unobserved. Empty selections do not count. PostToolUse proves
only the returned selection at receipt time; it does not prove full-file reading,
comprehension, arbitrary shell success or a historical revision.

The [Claude hooks contract](https://code.claude.com/docs/en/hooks) supplies native
tool-use IDs and successful Read events. Codex and Claude map these session/call
IDs to opaque deterministic UUIDv8 identifiers: attempt and observation share
correlation, retain distinct event IDs and deduplicate retries. Because these
payloads lack an occurrence timestamp, the first committed receipt time is
retained. Startup creates a session observation; Claude also counts clear.
Resume, compact and fork may supply context without inventing a new start.

The [Gemini hook reference](https://geminicli.com/docs/hooks/reference/) and
[file-system tool reference](https://geminicli.com/docs/tools/file-system/) define
its native read_file input, error/result envelope and ISO timestamp. The
[Copilot hook reference](https://docs.github.com/en/copilot/reference/hooks-reference)
defines the distinct CLI camelCase input and successful view result envelope.
These adapters use bounded native timestamps and opaque session IDs. Their
documented hooks lack a native tool-call ID: attempts and successful observations
therefore have separate timestamp/event/path-derived identities and cannot be
paired reliably. Retries with the same receipt deduplicate; two independent
identical same-timestamp receipts can collapse. Counts do not conceal that
coverage gap. Copilot snake_case/VS Code payloads and legacy payloads missing
session IDs are unsupported rather than relabeled as Claude. Gemini accepts
UTC ISO timestamps with seconds or milliseconds; unsupported timestamp precision
or timezone shapes are ignored with a neutral diagnostic.

Each host preserves revision `unknown`. The currently discovered package
cannot prove a past call's revision. Missing/removed/unrecognized packages,
implicit loading, references, failures and other tools reduce coverage. Multiple
labels for one canonical package select the lexicographically first label.
The CLI requires complete selected-collection discovery; the dependency-free
plugin may identify a safe supported entrypoint despite warnings in unrelated
foreign metadata, while reporting incomplete discovery.

Raw hook input is strict JSON bounded at 1 MiB and discarded. Storage contains
only the [typed metadata envelope](https://github.com/i-9-ai/skills/wiki/Skill-Telemetry):
no prompts, bodies, paths, commands, transcripts or original native IDs.
Codex observation output is empty; the other hosts receive `{}`. Invalid
payloads, failed storage and unsupported events remain nonblocking, with fixed
redacted diagnostics where applicable. No permission decisions or result
modifications are emitted. Fixture tests prove mapping/storage behavior, not
live native delivery, enablement or complete measurement.

## Installed plugin hooks

Root manifests explicitly select `hooks/codex.json`, `hooks/claude.json` or
`hooks/copilot.json` for their respective hosts. The Gemini registration
`hooks/gemini.json` is an example for a separately reviewed extension/settings
integration; this repository does not declare a Gemini extension manifest.
All registrations invoke `src/transport/PluginHookRunner.ts --host HOST`
directly with Node 24. No Git lookup, build, installed CLI, node_modules or
automatic setup runs at event time. Copilot's registration supplies `--event`
because its CLI camelCase input does not include the native event name.
Portable skills remain independent of these integrations.

The runner requires a bounded absolute existing event `cwd` and discovers
the caller's `.agents/skills`, the selected agent state's `skills/` and
the installed plugin's own `.agents/skills`. It never rewrites catalogs.
Duplicate real package paths merge while equal names at distinct paths remain
separate. Context is capped at 24 entries and 4096 UTF-16 characters with complete
rows and coverage information; serialized output stays within 16 KiB. Each
host receives its own documented context envelope. Session context is retained
when telemetry storage is unavailable.

All adapters use the shared default `~/.agents/skills-usage.db` even when a host
automatically supplies a plugin DATA variable. `I9_AGENT_STATE_ROOT` selects
another root; `I9_SKILLS_USAGE_DB` explicitly preserves any legacy filename.
See [shared state and legacy preservation](https://github.com/i-9-ai/skills/wiki/Skill-Telemetry).
A valid observation may create only its selected external data directories.
Linked ancestors, database/sidecar links, overlap with the plugin/caller,
unwritable state and invalid schemas are rejected without a reset fallback.
Read-only queries never create or migrate storage. Path inspection assumes a
stable owned workspace and does not promise race-proof confinement.

Missing Node is a host launch failure, so prepare Node 24 explicitly or use the
prepared CLI manually. Hooks remain subject to the native host's trust and
enablement controls. Avoid duplicate enabled registrations across plugin and
project layers. There is deliberately no ambiguous `hooks/hooks.json` default
that could dispatch one host's payload to another adapter.

For a diagnostic from disposable owned directories, explicitly select test state:

```sh
printf '%s\\n' '{"hook_event_name":"SessionStart","source":"startup","session_id":"smoke-1","cwd":"/absolute/test-consumer"}' \\
  | I9_AGENT_STATE_ROOT=/absolute/test-state node /absolute/plugin/src/transport/PluginHookRunner.ts --host codex

printf '%s\\n' '{"hook_event_name":"SessionStart","source":"startup","session_id":"smoke-1","cwd":"/absolute/test-consumer"}' \\
  | I9_SKILLS_USAGE_DB=/absolute/test-data/usage.db node /absolute/plugin/src/transport/PluginHookRunner.ts --host claude
```

These calls test runtime envelopes and storage, not native hook delivery.
Synthetic tests launch configurations, exact read payloads, retries, malformed
timestamps, unsupported commands and hostile installed-root spellings under
disposable HOME. The [historical native pilot](https://github.com/i-9-ai/skills/wiki/Native-Plugin-Pilot)
has its own named revisions and limits; it does not certify these new mappings.
Disable only the selected registration to roll back, preserving every database.
Reviewed official references above were checked on 2026-10-01; recheck changing
host interfaces before installation.
