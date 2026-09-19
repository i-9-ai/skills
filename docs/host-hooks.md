# Session hook adapters

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

## Explicit read observation adapter

`hook telemetry-config --host claude --db /absolute/local-data/usage.db
--collection project=/absolute/project/.agents/skills` prints standalone Claude
registrations for SessionStart, PreToolUse and PostToolUse. Repeat `--collection`
for selected global or project roots. Merge only after reviewing the output and
authorizing that host installation; this command itself creates no files.
The generated command runs `hook observe --host claude` with the same options.

The Claude adapter counts startup/clear session observations, Read attempts and
successful native Read operations on discovered `SKILL.md` entrypoints. Its
official PostToolUse contract runs only after success; failure hooks, Bash,
implicit loading, references and other tools are excluded. Partial Read calls
count as one observed entrypoint read, not a complete-file or comprehension
claim. Unknown/missing packages, removal after the read and incomplete discovery
can reduce coverage; the adapter does not fabricate evidence to fill gaps.

Documented session/tool occurrence IDs map to opaque deterministic UUIDv8
occurrence/correlation identifiers. Attempt and result share correlation but
have distinct occurrence IDs. Because the host payload has no event timestamp,
`occurred_at` is the first committed receipt time; retries preserve that time
and reject any other changed evidence. Revision remains `unknown`, since the
current file cannot prove which bytes a past tool call read. Multiple collection
labels for one real package select the lexicographically first label.

Raw payloads are limited to 1 MiB, parsed as strict JSON, and discarded. No
prompt, result body, filename, transcript or original session/tool ID is stored.
Storage contains only the [typed telemetry envelope](skill-telemetry.md). A
successful or ignored hook emits `{}`; a collection/storage/input failure emits
`{}` plus a fixed diagnostic and exits 1, Claude's nonblocking failure path.
No decision fields, permissions, tool changes or exit-2 blocks are emitted.

Other hosts still require their own successful-read/occurrence mapping. Copilot
and Gemini have distinct payload shapes; do not relabel them as Claude events.
Use the explicit telemetry CLI or the separate MCP interface only when an emitter
has established the actual observation. Fixture tests prove mapping and storage
semantics, not native host enablement or complete usage measurement.
