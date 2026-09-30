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
Storage contains only the [typed telemetry envelope](https://github.com/i-9-ai/skills/wiki/Skill-Telemetry). A
successful or ignored hook emits `{}`; a collection/storage/input failure emits
`{}` plus a fixed diagnostic and exits 1, Claude's nonblocking failure path.
No decision fields, permissions, tool changes or exit-2 blocks are emitted.

Other hosts still require their own successful-read/occurrence mapping. Copilot
and Gemini have distinct payload shapes; do not relabel them as Claude events.
Use the explicit telemetry CLI or the separate MCP interface only when an emitter
has established the actual observation. Fixture tests prove mapping and storage
semantics, not native host enablement or complete usage measurement.

## Installed plugin hooks

The root plugin maps `hooks/codex.json` for Codex and `hooks/claude.json` for
Claude Code. They invoke `src/transport/PluginHookRunner.ts --host HOST` directly
with Node 24. No Git discovery, build, installed CLI, node_modules or automatic
setup is required. The portable skills themselves remain independent of hooks.

| Host baseline | Events | Launch form | Persistent metrics |
| --- | --- | --- | --- |
| Codex 0.159.0 | SessionStart startup/resume/clear/compact/fork | POSIX `node "$PLUGIN_ROOT/src/transport/PluginHookRunner.ts" --host codex` | No native read metrics claimed |
| Claude Code 2.1.277 | SessionStart startup/resume/clear/compact; exact Read PreToolUse/PostToolUse | `command: "node"` with separate script-path and `--host`, `claude` arguments | Selected `CLAUDE_PLUGIN_DATA/skill-usage.db` |

These are reviewed source/version baselines, not claims of support on every
earlier version. [Pinned Codex discovery](https://github.com/openai/codex/blob/687a119f0fcaace47e1f1abcc77cec6c813fd6da/codex-rs/hooks/src/engine/discovery.rs)
provides plugin root/data variables and requires trust. Claude's
[executable-argument contract](https://code.claude.com/docs/en/hooks#command-hook-fields)
substitutes path values as arguments without shell interpretation. Both adapters
show `Loading available skills overview` during session context generation and
have a ten-second host timeout. No Windows or remote-executor hook claim is made.

The runner reads at most 1 MiB of strict JSON from stdin. A supported event must
provide an absolute existing `cwd`; it selects the consumer collection even when
the process starts elsewhere. The installed module locates the plugin's own
`.agents/skills`; HOME selects the global `.agents/skills` read-only. No catalog
is rewritten. Same real package paths merge; equal names at different paths
remain separate. Context is limited to 24 entries and 4096 UTF-16 characters,
preserving complete rows and coverage information; serialized output stays within
16 KiB. Codex receives plain context and Claude the native SessionStart JSON
envelope. Unknown or malformed events receive neutral output and fixed diagnostics
where applicable, without permission decisions or payload contents.

Plugin discovery uses the package-owned, dependency-free frontmatter parser.
It supports canonical packages and common plain, quoted and block-scalar fields.
Foreign metadata outside its supported grammar is skipped with a coverage warning;
the ordinary prepared CLI keeps full YAML support. Neither successful discovery
nor a displayed row means the host activated that skill.

Claude session startup/clear, attempts and successful Read events reuse the
explicit adapter's occurrence IDs and first-receipt deduplication. Resume/compact
still provide context but do not fabricate a new session start. Missing successful
response evidence, failure events, shell commands, other tools and references
are not successful entrypoint reads. Codex has no mapped Read hook until its tool
contract supplies reliable read identity. No prompt, transcript, raw result,
filename or original host ID is stored.

Unsupported metadata in an unrelated package does not prevent the plugin from
counting a positively identified, safely read entrypoint. It still reports
incomplete discovery and cannot count unrecognized packages. The explicit CLI
adapter retains its stricter all-selected-collections validation default.

Storage selects only the current host's DATA variable, with no fallback to the
other host, the project, plugin bytes or a guessed home path. A validated missing
host data directory can be created without replacing existing entries. Relative,
linked, overlapping or unwritable state is rejected. Metrics failure preserves
session context and emits a fixed diagnostic; it never blocks a tool or modifies
its result. Missing Node is a host launch failure: prepare Node 24 explicitly or
disable the hook and use the prepared CLI manually.

For a direct diagnostic from a disposable consumer fixture, pipe a synthetic
event to a reviewed installed copy. Replace the paths with owned test directories:

```sh
printf '%s\n' '{"hook_event_name":"SessionStart","source":"startup","session_id":"smoke-1","cwd":"/absolute/test-consumer"}' \
  | node /absolute/plugin/src/transport/PluginHookRunner.ts --host codex

printf '%s\n' '{"hook_event_name":"SessionStart","source":"startup","session_id":"smoke-1","cwd":"/absolute/test-consumer"}' \
  | CLAUDE_PLUGIN_DATA=/absolute/test-data node /absolute/plugin/src/transport/PluginHookRunner.ts --host claude
```

These calls test runtime envelopes and storage, not native hook delivery. Isolated
tests additionally launch the checked-in configurations with spaces and shell
metacharacters in the installed root. The [native pilot](https://github.com/i-9-ai/skills/wiki/Native-Plugin-Pilot)
separately verifies Codex/Claude loading, SessionStart and local source rollback
at named revisions; hosted updates and native Read telemetry remain untested.
Do not create `hooks/hooks.json`: Claude
can merge that default with an explicit file and invoke the same event twice.
Do not duplicate an enabled project registration in the plugin layer. Disable
the selected manifest mapping to roll back, preserving persistent metrics.
