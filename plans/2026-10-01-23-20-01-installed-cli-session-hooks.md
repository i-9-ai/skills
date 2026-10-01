# Installed CLI session hook selection

## Objective and authority

Complete [issue #54](https://github.com/i-9-ai/skills/issues/54): generate and
verify opt-in session registrations for an explicitly installed local CLI,
independently of the toolkit checkout. The user authorized backlog completion.
No real host settings, installation, dependency download or publication is part
of this change.

## Scope and design

Preserve the existing checkout registrations byte-for-byte when no selection
flags are supplied, and preserve dependency-free installed plugin transports.
Add matching `--executable`, `--project`, `--global-root`, `--no-global` and
`--max-entries` selections to `hook session-config` and `hook verify`.

An explicit executable must resolve to a regular file accessible for execution.
Package-manager links resolve to their actual installed target; an absent or
non-executable target fails generation and verification. Paths and selected
arguments use literal POSIX shell quoting, including spaces and apostrophes.
Hermes still receives an explicit `sh -c` argument because its native runner
uses `shlex.split` without a shell.

The installed command always supplies `--project`: an explicitly selected root
is normalized once at generation, otherwise `"$PWD"` selects the host process's
consumer working directory at execution. It never falls back to the installed
toolkit's directory. Hosts that start in another directory, including nested
consumer directories, need the explicit project option. Global discovery remains
optional and uses the shared agent-state contract; selected discovery limits are
forwarded. Existing filesystem confinement and bounded rendering are unchanged.

## Verified host contracts

Official references rechecked on 2026-10-01:

- [Codex](https://learn.chatgpt.com/docs/hooks): shell commands run in the session
  cwd; preserve SessionStart matching, plain context, timeout/status/context limit.
- [Claude](https://code.claude.com/docs/en/hooks): preserve SessionStart settings
  and its JSON context envelope; cwd may change during a session.
- [Copilot CLI](https://docs.github.com/en/copilot/reference/hooks-reference):
  preserve `bash`, `sessionStart`, `timeoutSec` and `additionalContext`.
- [Gemini](https://geminicli.com/docs/hooks/reference/): preserve SessionStart
  groups, JSON context and millisecond timeout.
- [Antigravity](https://antigravity.google/docs/hooks?tab=ide): preserve named
  PreInvocation mapping, invocation gating and injected steps.
- [Hermes](https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks):
  preserve first-turn gating and explicit shell invocation for its shell-free
  command tokenizer.

These interface checks do not establish native delivery or host trust. No
upstream code or licensed assets are copied.

## Instruction map

Retain root authority, `src/AGENTS.md` runtime layers,
`src/command/AGENTS.md` and its hook contract, disposable `tests/AGENTS.md`,
and `plans/AGENTS.md` durable recipes. Only the existing plans index gains this
focused entry. No child contract, folder responsibility or package changes.
Operator guidance stays in `docs/Host Hooks.md` and `bin/index.md`.

## Validation and evidence

Use Node 24 with existing dependencies. Cover absent/non-executable paths,
canonical executable links, complete selection verification and mismatch
rejection. Execute generated registrations for all six hosts using a disposable
local executable and HOME, with a non-Git consumer and quoted paths. Prove that
consumer metadata is returned while installed toolkit metadata is absent,
explicit project/global/limit options work, no settings or evidence are written,
and removed executables fail verification. Retain distinct fixture execution
and native host evidence claims. Run focused tests, scoped Prettier, typecheck,
repository validation and whitespace checks; root owns full checks and exact
commit review.

## Rollback and limits

Remove only an authorized session registration to disable it; databases and
unrelated settings remain untouched. Reverting this change restores the prior
CLI interface without deleting caller data. Runtime availability checks are
point-in-time, not guarantees of future executable identity, dependency health,
host enablement or response time. POSIX commands require a retained local
runtime and Node 24; Windows and cloud launch behavior remain untested. No `npx`
or installation command is emitted at event time.
