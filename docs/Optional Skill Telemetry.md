# Optional Skill Telemetry

Skill discovery works without telemetry. Optional observations count bounded
entrypoint read attempts and confirmed reads; they do not prove activation,
correct use, or successful outcomes. No prompts, file bodies, raw commands or
credentials are stored. Evidence stays local at `~/.agents/skills-usage.db` by
default. Select `I9_AGENT_STATE_ROOT` for another shared root, or
`I9_SKILLS_USAGE_DB` for an explicit evidence file. Setup never uploads evidence.

## Explicit setup

Node.js 24+ and the selected host's trusted command hooks are prerequisites.
Choose the actual settings file and one or more absolute collection roots.
Create its parent directory deliberately if it does not exist. Supported
settings locations differ:

| Host | Typical project settings | Observed tool |
| --- | --- | --- |
| Codex | `.codex/hooks.json` | Bounded literal `Bash` entrypoint reads |
| Claude | `.claude/settings.json` | Native `Read` |
| Copilot | `.github/hooks/i9-skills.json` | Supported native read tools |
| Gemini | `.gemini/settings.json` | Native `read_file` |

These commands use POSIX shell registrations. Confirm the installed host's
current hook contract and trust rules; a generated registration is not proof
that a host executed it. Avoid registering both plugin and project observation
hooks for the same collection. Host-managed plugin registration is separate
and is not removed by these commands.

```sh
mkdir -p "$PWD/.claude"
npx @i-9.ai/skills hook telemetry-enable \
  --host claude --file "$PWD/.claude/settings.json" \
  --collection "project=$PWD/.agents/skills"
# Inspect the preview before applying the same arguments with --write.
npx @i-9.ai/skills hook telemetry-enable \
  --host claude --file "$PWD/.claude/settings.json" \
  --collection "project=$PWD/.agents/skills" --write
npx @i-9.ai/skills hook telemetry-status \
  --host claude --file "$PWD/.claude/settings.json"
```

Repeat `--collection "global=$HOME/.agents/skills"` only when that collection is
intentionally selected. Omit nonexistent collections rather than claiming
complete coverage. `--db` overrides the default database for this registration.

By default, setup records this running Node and toolkit launcher as absolute
paths. Execution through `npx` downloads only for the explicit setup invocation;
hook events themselves perform no download, compilation or installation.
Clearing npm's cache can remove that runtime. For durable operation, select an
already installed executable with `--executable /absolute/path/to/i9-skills`.
Status reports missing runtime. Disable the exact owned registration, then
enable with the new runtime after removal or upgrade. Changed runtime, database
or collection selections require this explicit replacement sequence. A
cold-cache `npx` command is not silently placed in every hook.

## Settings preservation and removal

Enable merges registrations and writes a sibling `<settings>.i9-skills.json`
receipt containing only owned entries, runtime paths and the selected database.
It retains unrelated settings and fails on malformed, linked or concurrently
modified files. Repeating an identical owned registration changes nothing.
The receipt is local operational state; do not publish it.

```sh
npx @i-9.ai/skills hook telemetry-disable \
  --host claude --file "$PWD/.claude/settings.json"
npx @i-9.ai/skills hook telemetry-disable \
  --host claude --file "$PWD/.claude/settings.json" --write
```

Disable removes only exact receipt-matched entries and retains the database.
Changed or duplicated owned entries require manual reconciliation; they are
never deleted by guesswork. Status and previews do not create a database.
An inactive receipt remains for inspection and future setup.

## Evidence inspection

After a supported native read, query the shared evidence database with
`npx @i-9.ai/skills telemetry rankings` or an explicit `--db` path. Missing or
unwritable storage is a reported coverage gap and does not block the original
tool operation. Session counts and read frequency are prioritization signals.
See [Skill Telemetry](https://github.com/i-9-ai/skills/wiki/Skill-Telemetry) for
event semantics and limits, and
[Host Hooks](https://github.com/i-9-ai/skills/wiki/Host-Hooks) for adapter details.
