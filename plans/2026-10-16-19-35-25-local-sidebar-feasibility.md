# Local sidebar feasibility test

Status: native UI acceptance pending. This follows the reviewed visual proposal,
not a product or public-release announcement. Related: [issue #106](https://github.com/i-9-ai/skills/issues/106).

## Objective and scope

Test whether the selected desktop host discovers a local MCP App's global
entrypoint and renders the existing panel design. The user requested a working
local demonstration after reviewing the proposal. Prepare an isolated lab plugin
with a fixed read-only probe tool, a fixed HTML resource and a bounded browser
bridge. Reuse the visual artifact without copying any skill packages.

The lab lives under ignored `.work/sidebar-panel-native/`. It has a separate
plugin and marketplace identity, no hooks, no account service, no dependencies,
no telemetry database, no model invocation and no mutations exposed as tools.
The catalog in its design remains frozen, explicitly labeled preview data.
It is not part of npm, the public plugin ZIP or the promotion website.

## Source and host contract

Rechecked official documentation on 2026-10-16:

- [Extensions](https://developers.openai.com/plugins/build/extensions) defines
  `_meta.ui.resourceUri` and `openai/ui.entrypoints` with `type: global`.
- [MCP App UI](https://developers.openai.com/plugins/build/chatgpt-ui) defines
  the HTML resource and `ui/initialize`/`tools/call` bridge.
- [Local plugin packaging](https://developers.openai.com/plugins/build/plugins)
  separates local MCP configuration from registered App mappings.

The published UI documentation names ChatGPT; local stdio discovery alone does
not prove that the selected Codex desktop surface creates a sidebar entry.
Do not invent a registered App ID or equate an ordinary browser panel with it.
The installed CLI is 0.162.1; its actual plugin commands govern installation.
The desktop build and visible UI remain separate observations.

## Sequence and authority

1. Prepare fixed lab files and inspect them before installation. Verify the
   exact MCP descriptor/resource, initialization, rejection of unknown tools
   and resource URIs, argument bounds and browser fallback.
2. Register only the distinct local lab marketplace and plugin through the
   installed CLI's supported commands. Preserve all existing installations.
   The user's request authorizes this reversible local demonstration.
3. Verify the native installation result and retained bytes. A new desktop
   session or user refresh may be required; this is not automatic UI acceptance.
4. Observe the real entry and component when the host permits it. This session's
   computer-use boundary prohibits controlling Codex itself, so the final visible
   test may need the user. Keep native acceptance open until actually observed.

No existing plugin replacement, hook trust, public endpoint, account upload,
deployment, merge, package bump or release is authorized by this experiment.
Do not publish the panel on the site as available before native support works.

## Verification and rollback

Retain lab file digests, native CLI output, protocol checks, bridge/fallback
checks and any user-confirmed UI observation under the lab scratch directory.
Run repository checks for tracked changes. Independent review covers the exact
tracked documentation commit; scratch and installation evidence stay local.

Remove only the lab plugin and its named marketplace through supported commands
if the host cannot render it, retaining the source and observations for diagnosis.
Never delete a shared marketplace, modify the existing I-9 Skills installation,
or remove caller evidence. Browser rendering is not native sidebar proof.

## Instruction map

Root instructions retain repository authority; `plans/AGENTS.md` owns this
experiment record. Source, tests, packages and website scopes are unchanged.
Add this plan to the existing index, with no new child instruction boundary.
