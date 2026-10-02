# Optional native adapters

Load this only when the caller selects a native host or an already reviewed
collection toolkit. These integrations are optional; the generic local route
in the entrypoint needs none of them.

Native command hooks execute with host/user authority. Confirm installed version,
settings location, trust, exact read event/result fields and existing observers
before registration. Inspect the exact command and retained runtime; keep the
host's trust review, sandbox and approval settings intact. A runtime's presence
does not establish that its hook command is safe or authorized. An after-event
can represent a failed operation. Current
official contracts were inspected on 2026-10-01:

| Host    | Selected event and evidence                            | Important limit                                                                 |
| ------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Codex   | PostToolUse, locally supported tool input/result       | Nonzero Bash exit can still deliver an after-event; hosted tools are excluded   |
| Claude  | PostToolUse, successful Read input and tool_response   | Other sources or duplicated plugin/project registration need separate coverage  |
| Gemini  | AfterTool read_file result, including error status     | Validate successful text result; pairing and session identity may be incomplete |
| Copilot | Selected CLI postToolUse or SDK-specific success event | CLI and SDK schemas differ; do not transplant fields between them               |

For confirmation and version-sensitive fields, use the official
[Codex](https://learn.chatgpt.com/docs/hooks),
[Claude](https://code.claude.com/docs/en/hooks),
[Gemini](https://geminicli.com/docs/hooks/reference/),
[Copilot CLI](https://docs.github.com/en/copilot/reference/hooks-reference) and
[Copilot SDK](https://docs.github.com/en/copilot/how-tos/copilot-sdk/hooks/post-tool-use)
references. They do not authorize a host change or establish live delivery.

## Optional collection toolkit

If the caller deliberately selects `@i-9.ai/skills`, Node 24+ and its current
CLI provide separately maintained native registration adapters. This example
selects the published 0.3.0 implementation for a reproducible runtime review;
choose and review an update explicitly instead of silently changing the reviewed
implementation. Verify the
actual package identity/version and available commands; a same-named skill or
sibling directory does not establish this dependency. A current source
implementation does not prove that the required command has reached npm.

```sh
npx @i-9.ai/skills@0.3.0 hook telemetry-enable --host claude \
  --file "$SETTINGS_FILE" --collection "project=$COLLECTION_ROOT"
npx @i-9.ai/skills@0.3.0 hook telemetry-enable --host claude \
  --file "$SETTINGS_FILE" --collection "project=$COLLECTION_ROOT" --write
npx @i-9.ai/skills@0.3.0 hook telemetry-status --host claude --file "$SETTINGS_FILE"
npx @i-9.ai/skills@0.3.0 hook telemetry-disable --host claude --file "$SETTINGS_FILE"
npx @i-9.ai/skills@0.3.0 hook telemetry-disable --host claude --file "$SETTINGS_FILE" --write
```

The variables must contain deliberately selected existing absolute settings and
collection paths. Additional hosts are `codex`, `copilot` and `gemini`.
Repeat `--collection` only for another intentionally selected root. Optional
`--db` selects an explicit evidence file; `--executable` selects an already
installed absolute toolkit executable. Its receipt suffix is
`.i9-skills.json`, separate from the generic reference helper's receipt.
Never exchange ownership receipts between these implementations.
The toolkit adapter's interface is independent of the generic reference helper's
`--reviewed-registration` option. Review its preview and exact generated commands
under the same user authority; do not pass an unsupported option between tools.
When the runtime, database or selected collections change, preview and disable
the previous owned registration, then preview and explicitly enable the new one.
Do not overwrite a drifted registration or silently adopt an unowned match.

Invoking npx can download the package for that explicit invocation. Hook events
must use the retained runtime and perform no download or compilation. A cached
npx runtime can disappear; status and deliberate reconfiguration handle that
coverage gap. If the command is missing, the caller chooses a reviewed toolkit
update or the complete generic fallback; do not install or upgrade implicitly.
