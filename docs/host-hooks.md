# Session hook adapters

The unified checkout CLI renders available-skill context and adapts its output
for the selected host. Generation prints JSON only; it never writes settings,
enables hooks, installs dependencies, or reads incoming prompts/transcripts.
Run Node 24 and explicit npm ci in a trusted checkout first.

| Host | Proposed project location | Event | Output | Timeout unit |
| --- | --- | --- | --- | --- |
| Codex | .codex/hooks.json | SessionStart | Plain context | Seconds |
| Claude Code | .claude/settings.json | SessionStart | hookSpecificOutput with hookEventName and additionalContext | Seconds |
| GitHub Copilot CLI | .github/hooks/i9-skills.json | sessionStart | additionalContext | Seconds (timeoutSec) |
| Gemini CLI | .gemini/settings.json | SessionStart | hookSpecificOutput.additionalContext | Milliseconds |
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
Copilot uses its documented camelCase contract. Codex retains the tested local
registration and status text "Loading available skills overview".

Run `node bin/index.mjs hook session-index --host HOST --project PATH --no-global`
to inspect the corresponding output without installing a hook. Omit
`--no-global` only when global metadata discovery is intended. Output contains
bounded package summaries, never a claim of activation. Metadata and descriptions
are untrusted shortlist data; selecting a package still requires its entrypoint
and host capabilities. Unsupported hosts use `context available-skills`.

## Evidence and limitations

Reviewed on 2026-09-19: [Claude hooks](https://code.claude.com/docs/en/hooks),
[Copilot hooks](https://docs.github.com/en/copilot/reference/hooks-reference),
and [Gemini hooks](https://geminicli.com/docs/hooks/reference/).
The Codex contract is preserved from the existing reviewed repository adapter.
These changing interfaces require rechecking before installation. Tests cover
configuration, timeout units, context envelopes, mismatch failures and no
configuration writes in disposable fixtures. Native host trust, enablement and
execution have not been exercised. No cross-host runtime certification is made.

Automatic pre/post-tool read telemetry remains unimplemented. Pre-tool events
prove an attempt only; tool text cannot prove a successful skill-file read.
The explicit usage MCP remains separate. OpenCode requires a plugin contract,
not one of the JSON registrations above; no inert configuration is advertised.
