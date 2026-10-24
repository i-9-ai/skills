# Panel entrypoint icon

Related: draft PR #107 and issue #106. The operator asks whether the native panel
entry can show a custom icon. Their confirmed global catalog remains unchanged.

## Scope and evidence

Official OpenAI plugin-extension documentation defines the tool-based global
entrypoint. Read-only inspection of the installed desktop client additionally
shows that local entrypoints resolve standard tool `icons`, accepting HTTPS or
data URLs and selecting theme/size variants. Plugin listing `logo` and
`composerIcon` alone do not supply this local tool's icon.

Reuse the existing fixed packaged assets/plugin-icon.png as a bounded PNG data
URL on skill_panel_open. Load it through the panel resource repository and
coordinate presentation through the panel service; the transport adds it only
to that optional opening tool. Keep normal MCP mode and all write/read authority
unchanged. Missing or invalid optional branding falls back to the host icon.
No dependencies, external requests, copied global packages or new image assets.

Existing root → src/transport, root → tests, root → plans and root → website
instruction scopes remain unchanged; no new child boundary is introduced.

## Acceptance and validation

Source and installed-package protocol checks must decode the advertised PNG to
the exact bundled icon bytes. Run the relevant protocol tests, full check,
package check, Changeset validation and independent review on the final commit.
Update operator docs, the pending Changeset and all three candidate website
descriptions without advertising general native availability.

Update only the already authorized private lab, preserving its selected/global
paths, original packages and proposals. Verify actual installed tool metadata;
visible icon rendering requires the operator's separate observation after
reopening the component. Do not restart Codex, force a process refresh, merge,
publish or deploy.

## Removal

Remove the opening tool's icons field to restore the generic host icon. No
stored skills, proposals, settings outside the existing lab or data migrations
need to be changed or removed.

References: https://developers.openai.com/plugins/build/extensions and
https://developers.openai.com/plugins/deploy/submission (checked 2026-10-16).
