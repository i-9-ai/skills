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

Automatic observers require a deliberately retained package whose code and
dependencies have no write bits. A mutable checkout or npm cache is refused.
Select a reviewed published release, inspect the package contents and retain it
outside skill-discovery directories. For example, prepare a new private runtime
explicitly; these commands are never run by a hook:

```sh
set -eu
umask 077
export OBSERVER_RUNTIME="$HOME/.agents/runtimes/i9-skills"
mkdir -p "$(dirname "$OBSERVER_RUNTIME")"
mkdir "$OBSERVER_RUNTIME" # Refuse reuse of an existing runtime directory.
npm pack @i-9.ai/skills --pack-destination "$OBSERVER_RUNTIME"
tar -xzf "$OBSERVER_RUNTIME"/i-9.ai-skills-*.tgz \
  -C "$OBSERVER_RUNTIME" --strip-components=1
(cd "$OBSERVER_RUNTIME" && npm install --omit=dev --ignore-scripts)
chmod -R a-w "$OBSERVER_RUNTIME"
```

The published package contains prepared JavaScript. Installing its production
dependencies with lifecycle scripts disabled keeps them inside this retained
root; hoisted dependencies outside the inspected runtime are refused. Review
the selected release and dependency bytes before enablement. Setup follows the
declared production dependency graph, resolving each package from its importer;
an indirect dependency found outside this runtime is refused too. This bounded
manifest inspection does not analyze undeclared or computed imports. A read-only mode
does not prevent its owner from changing permissions; this assumes a stable,
caller-owned filesystem, not an adversarial sandbox. Node itself is the selected
existing runtime foundation, whose bytes are included in the review identity.

```sh
mkdir -p "$PWD/.claude"
node "$OBSERVER_RUNTIME/bin/index.mjs" hook telemetry-enable \
  --host claude --file "$PWD/.claude/settings.json" \
  --collection "project=$PWD/.agents/skills" > "$PWD/.claude/observer-preview.json"
cat "$PWD/.claude/observer-preview.json"
# After inspecting the exact commands, collections, sink and runtime identity:
REVIEWED_REGISTRATION="$(node --input-type=module -e \
  'import fs from "node:fs"; console.log(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).registration_digest)' \
  "$PWD/.claude/observer-preview.json")"
node "$OBSERVER_RUNTIME/bin/index.mjs" hook telemetry-enable \
  --host claude --file "$PWD/.claude/settings.json" \
  --collection "project=$PWD/.agents/skills" --write \
  --reviewed-registration "$REVIEWED_REGISTRATION"
node "$OBSERVER_RUNTIME/bin/index.mjs" hook telemetry-status \
  --host claude --file "$PWD/.claude/settings.json"
```

Repeat `--collection "global=$HOME/.agents/skills"` only when that collection is
intentionally selected. Omit nonexistent collections rather than claiming
complete coverage. `--db` overrides the default database for this registration.

Writes require the exact `registration_digest` from the inspected preview.
Missing or changed digests fail before settings/receipt creation, including an
otherwise identical request. The digest binds the selection and observed runtime
bytes; it is not a signature, authenticated consent or native-host trust.
Keep the private preview outside publication and skill-discovery trees.

Setup accepts this running Node and the toolkit's own launcher, validates the
installed runtime inventory and records their identity. Arbitrary shell fragments
and unrelated binaries cannot enter this automatic registration path. An optional
`--executable` must resolve to the same running Node, not a separate CLI binary.
Hook events perform no download, compilation or installation. Invoke the retained
runtime's own `bin/index.mjs` using Node rather than selecting an unrelated
executable. Normal npx MCP/catalog/query commands remain supported; their cache
is not an automatic observer runtime.
Status reports missing or changed runtime. Disable the exact owned registration, then
enable with the new runtime after removal or upgrade. Changed runtime, database
or collection selections require this explicit replacement sequence. A
cold-cache `npx` command is not silently placed in every hook.

## Settings preservation and removal

Enable merges registrations and writes a sibling `<settings>.i9-skills.json`
receipt containing owned entries, runtime identity and the selected database.
It retains unrelated settings and fails on malformed, linked or concurrently
modified files. Repeating an identical owned registration changes nothing.
The receipt is local operational state; do not publish it.
Runtime files must remain stable in the caller-owned directory. Preview, apply
and status inspect current bytes; the hooks do not reverify the entire inventory
on every event or provide a sandbox against hostile filesystem replacement.

```sh
node "$OBSERVER_RUNTIME/bin/index.mjs" hook telemetry-disable \
  --host claude --file "$PWD/.claude/settings.json"
node "$OBSERVER_RUNTIME/bin/index.mjs" hook telemetry-disable \
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
