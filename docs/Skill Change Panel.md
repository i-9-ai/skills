# Local skill-change panel

Availability: experimental candidate source. The published 0.3.4 npm package and
public skills-only plugin do not include this workflow. This is a local MCP Apps
resource, not a hosted service or a generally accepted marketplace extension.
Native rendering depends on the selected host; protocol and browser-test results
do not certify persistent global sidebar support.

## Select a private pilot

Use a trusted owned collection with ordinary direct skill directories. For a
first exercise, copy one real skill into a private development collection while
preserving its license and resources. Do not point a first test at installed
global packages or the canonical source. Keep state outside the collection and
ensure its parent already exists. The backend creates private state only when a
review request or candidate is explicitly retained, not when the panel opens or
absent history is read.

With Node 24+ and explicit `npm ci`, configure the existing local stdio MCP:

```sh
node bin/index.mjs mcp serve \
  --panel-collection /absolute/local-pilot/skills \
  --panel-state /absolute/local-pilot/proposals
```

Both flags are required together. The dependency-free local plugin entrypoint
accepts the same selections after `--host codex`, `--host claude` or
`--host copilot`. This is an explicit configuration choice; existing manifests
do not silently turn the panel or its write operations on. The explicitly selected
pilot mode exposes only its nine panel tools; unrelated evidence/database writes
are unavailable. Without these flags, the normal catalog and telemetry MCP keeps
its existing tools and contracts.

Open `skill_panel_open` in an MCP Apps-capable host. A plain MCP client can read
its structured result and the fixed `ui://i9-skills/skill-panel/v1.html` resource.
Opening the panel does not enable hooks, record usage or create a database.
Inspection needs no remote assets, model call or hosted panel service.
User-clicked reviews use the host agent's existing connectivity and permissions.

The sidebar entry is titled **I-9 Skills**; `skill_panel_open` remains its stable
technical tool name. Fixed-resource reads accept standard client request metadata
and template discovery returns an empty list. Metadata never selects another
resource or grants access. After updating a local lab, verify which version the
host actually loaded; an already open component may retain its prior process.
Tool discovery, successful HTML retrieval and visible native rendering are
separate checks when investigating a host's “could not display” message.

## Native entry icon

The opening tool advertises a distinct I-9 monogram through standard MCP `icons`
metadata. Its bounded SVG data URLs share one transparent, path-based I-9 mark
over stacked skill cards, retaining a small hyphen. Explicit light/dark variants
resolve every fill and outline to pure black or white. Neutral endpoints preserve
uniform raster colors at antialiased edges, avoiding a near-white SVG becoming
almost transparent in a host's monochrome luminance mask. No external image
request, font or local absolute path is needed. A supporting host can use it for
the native entry, including monochrome presentation. Actual display and caching
depend on that host.
Missing optional branding falls back to its generic icon without disabling the
panel. The public listing/site cube logo is unchanged; plugin listing `logo` and
`composerIcon` describe separate presentation surfaces.

## Include global skills

Add an explicitly selected global collection without copying its packages:

```sh
node bin/index.mjs mcp serve \
  --panel-collection /absolute/local-pilot/skills \
  --panel-state /absolute/local-pilot/proposals \
  --panel-global-collection "$HOME/.agents/skills"
```

The plugin entrypoint accepts the same optional flag after both pilot paths.
Global reference parsing uses the existing production YAML dependency: prepare
the checkout with `npm ci` or use the prepared artifact. Selected-only plugin
discovery keeps its dependency-free parser.
Omitting it preserves selected-only discovery. The server never guesses a home
directory. Global discovery follows package links and ordinary namespaces,
excludes hidden system directories, and deduplicates real package paths. Equal
names at different paths remain separate, with stable opaque `global:` IDs;
names alone cannot redirect inspection to another package.

An alias of a package already in the selected private collection deduplicates to
that selected entry and preserves its existing editing authority. Other global
references remain read-only unless global evolution is explicitly enabled below.
Before creating proposal state or acquiring a write
lock, the backend compares physical global roots and filesystem reference paths
with the selected collection and state destination, including an existing
destination's actual case. This check is independent of metadata validity:
invalid YAML cannot remove a linked package's protection. Ancestor aliases cannot
silently place state inside a global reference.

The boundary walk inspects ordinary global directories up to 32 levels and
16,384 entries, protects whole linked targets without crawling external
repositories, and refuses writes on unavailable, broken, overlapping or
incompletely checked boundaries. Available read-only references remain visible
with a warning. Correct the selected paths or reference coverage before writing;
there is no fallback that disables this protection automatically.

Use **All skills**, **Selected copies** or **Global skills**, then
search by human name or description. **Refresh catalog** reloads available
pages from actual source metadata. The MCP tool accepts optional integer `offset`
and `limit` (1–128, default 128), returning `total` and `next_offset`. Plain clients
must follow `next_offset` until null. The combined catalog is bounded at 1,024
packages, with 4,096 inspected directory entries per source, and reports incomplete coverage or broken sources;
catalog descriptions are shortened to 256 code points for display.
The UI checks `catalog_revision` between pages and requests a fresh load when
source metadata changes during pagination.

Without write opt-in, selecting a global reference reads only its bounded UTF-8 `SKILL.md` (128 KiB),
with its entrypoint hash, rather than asserting a complete package fingerprint.
Returned text preserves exact UTF-8 bytes, including a leading BOM; parsing
normalizes only a separate metadata view.
**Review with agent** can request a read-only assessment in the current
conversation. **Describe a change** and manual candidate editing are
disabled for these references, and the backend rejects global candidate
writes. The existing selected-package workflow below retains its explicit approval
and recovery rules. A global reference does not need this repository's icon or
license layout to appear. Its text is source material, never permission to run a
script, modify a package or broaden access. The current-result card explains
that these reviews have no candidate diff; disabled comparison is not a pending
approval step. No global catalog or usage state is written.

## Enable approved global evolution

For an owned global collection, explicitly add `--panel-global-write`:

```sh
node bin/index.mjs mcp serve \
  --panel-collection /absolute/local-pilot/skills \
  --panel-state /absolute/local-pilot/proposals \
  --panel-global-collection "$HOME/.agents/skills" \
  --panel-global-write
```

The plugin entrypoint accepts the same final switch after both panel paths and
the global collection. The switch requires all three selected paths. It enables
the capability to prepare and approve a global proposal; it never approves an
individual change. Opening or installing the panel does not edit any skill.

Eligible ordinary packages physically inside the configured global root display
**Global · editable**. Their complete package revision is frozen before the
request and candidate, using the same bounded retained original/candidate,
local-check, intent, stale-source and recovery workflow as selected copies.
The saved global identity includes its source-qualified ID and configured global
root identity. It cannot be redirected to another same-name package or root.
The diff and approval explicitly identify the real global target, rather than a
private copy. Only its `SKILL.md` is replaced, after exact approval.

Global eligibility requires the existing safely preservable package profile,
including supported portable frontmatter, matching directory/name, retained
license/resources, ordinary files and the package bounds below. Unsupported
formats, packages outside the global root through aliases, reserved `.system`
entries, hardlinks and unsafe trees never gain mutation authority. Inspection
falls back to the read-only entrypoint with a visible reason. Metadata discovery
or a path alias alone cannot authorize a global write. No scripts execute.

Choose **Describe a change**, let the host agent record its proposal, then click
**View proposed diff**. Inspect both versions and checks, acknowledge the exact
global change and choose **Approve & apply**. The server verifies the current
package and retained bytes again. A changed sibling resource or source revision
requires a new proposal, not reuse of the old approval. **Keep proposal** changes
nothing. Recovery requires reviewing and approving the separate reverse diff.

Existing selected-copy proposals and old read-only global review records are
preserved. Enabling global evolution does not reinterpret a prior findings-only
review as an editable request or fabricate its missing candidate. Start a new
review/change request for the complete global package revision.
Removing the switch disables new global mutation; preserve all retained state.
No global catalog, telemetry or public plugin configuration is synchronized.

## Review a real candidate

The compact library stays beside one skill workspace on desktop and stacks above
it at narrow widths. **Overview** explains the source boundary and exposes the
inspected identity. **SKILL.md** shows the last inspected read-only entrypoint;
it does not claim to observe later disk changes automatically.
The **current result** sits immediately below the selected skill title, before
its description, evidence detail and workspace tabs. It shows a bounded report
excerpt, a **Read full review result** disclosure for long reports, and the reason
a diff is or is not available. The full report uses normal document flow rather
than a separately scrolling text box. Older work and generic instructions live
under collapsed **Review history and saved proposals** and **How review and diff
approval work** disclosures.

**View proposed diff** and the **Diff & approval** tab become available as soon
as a retained proposal is listed. Either action reloads its authoritative state
before showing the comparison; metadata alone does not establish readiness.
**Open saved diff** distinguishes a retained proposal from a newer review that
returned no candidate. A normal review does not require filling in a complete
file. Arrow keys, Home and End move through available workspace
tabs. Source filters and search operate on the loaded real catalog, without
inventing categories, quality scores or related-skill recommendations.

1. Select a skill. The panel reads actual `SKILL.md` content, file count, byte
   count and an exact package fingerprint including ordinary file modes.
2. Click **Review with agent**, or **Describe a change** to supply an optional
   natural-language focus. The panel saves a request at the live source identity
   and asks the host to send it to this conversation through `ui/message`, only
   when the host advertises text messaging. A message acknowledgement does not
   prove that an agent is running. Unsupported hosts show an explicit unsent
   manual fallback; no hidden server-side model call is made.
3. The agent reads the actual source. If a focused improvement is justified, it
   authors complete candidate text and calls `skill_panel_propose` with the frozen
   package `base_sha256`. This retains both packages, the exact diff and local
   structural checks, without editing the selected skill. Only `SKILL.md` can
   change; preserve the package name.
4. The agent calls `skill_panel_complete` to record **no changes**, **findings**,
   a matching **proposal**, or a **blocker**. The current-result card shows that
   outcome near the skill title. Click **View proposed diff** to open its verified
   retained comparison; no
   proposal ID or pasted candidate is required. Check for results manually or
   leave the panel visible for bounded polling (up to 30 checks, four seconds
   apart). Closing the chat does not imply completion. **Continue review** is an
   explicit user action that reuses the saved request; messages are never retried
   automatically. An uncertain delivery remains unconfirmed until inspected.
5. Inspect the side-by-side retained versions, numbered lines, changed ranges
   and actual checks. The comparison initially scrolls toward the change;
   scroll either pane to inspect the full text. The detail disclosure retains
   exact proposal hashes, local validation detail and the complete unified diff,
   including EOF-only changes. Large files use full plain text to bound rendered
   row nodes. Official Agent Skills conformance and
   behavioral evaluation are explicitly `not_run` by this pilot; a local
   structural pass cannot establish semantic quality or release readiness.
   A failed local check disables application. Run required official and task
   validation separately before accepting a package for distribution.
6. Acknowledge the exact diff and limits, then choose **Approve & apply**.
   The backend verifies the entire package, retained artifacts and approval
   hashes again before replacing the entrypoint. Editing the candidate or
   changing selection, leaving the comparison or refreshing its proposal clears
   UI consent. **Keep proposal** returns to the overview without applying; the
   comparison remains selectable under **Review history and saved proposals** after reopening
   the panel, and the server retains its ID and artifacts.
   No approval is inferred from a task
   request, model output or earlier proposal.

Reading a skill alone creates neither a review result nor a diff. A no-change
result is displayed explicitly and has no fabricated comparison. Recorded agent
reports are assertions, not quality certification; a request at a different source
revision is labeled accordingly. Pending requests remain pending when an agent
stops without recording an outcome. A host refusal or message timeout never
authorizes a resend, application or broader access.

The normal flow is host-assisted, not autonomous. The server does not generate
text or call a provider. The panel uses the advertised standard text-message
capability and, when available, the OpenAI active-conversation message extension.
See the [official extension contract](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md).
Actual message delivery, model execution and return-tool use must be exercised
in the selected native host separately from browser fixtures.

**Advanced: supply candidate text yourself** remains available for a prepared
complete file and rationale. Its **Preview and validate** runs the same retained
proposal workflow; it is not the expected first step for an agent review.

The agent may prepare a candidate; applying and restoring are advertised as
app-only tools and belong to an explicit operator action. `ui.visibility` is
discovery metadata, not authentication: an arbitrary MCP client can assert
approval. Use this pilot only inside the trusted local host and stable owned
workspace. Do not expose its stdio input as an unauthenticated remote service.

## Recovery and interruption

The result contains a proposal UUID. Review requests/results live alongside those
proposals in the same private selected state. Retain the entire directory:

```text
proposals/<proposal-id>/
  before/<skill>/        preserved original package
  candidate/<skill>/     supplied candidate package
  proposal.json         byte-bound proposal and observed local validation
  applying.json         write intent, if application was requested
  applied.json          completed application, when observed
  recovering.json       recovery intent, when requested
  recovered.json        completed recovery, when observed
proposals/request/<request-id>/
  request.json          source-bound user intent, kind and optional focus
  result.json           immutable agent report, when recorded
```

After reopening, select the skill and choose **View proposed diff**, **Open saved
diff**, or **Compare proposal** in its history. **Advanced: open by ID** is only a
fallback for a known UUID. After
application, **Review recovery** shows the reverse diff. Restoring needs a new
explicit acknowledgement and **Restore approved version**. Recovery restores
only `SKILL.md` and refuses intervening package edits, preserving the original
instead of overwriting newer work. Repeating a completed operation verifies the
expected current bytes and returns a no-op rather than repeating a write.

If a response times out, the write result is unknown. Use **Refresh proposal
state** before another write. Both comparison columns are labeled retained
versions until that inspection confirms the source again; the detail view marks
previous status and intent as earlier observations. Reopening an incoming tool
result reloads its proposal by ID instead of trusting the earlier result's state.
Closing the workflow, selecting another skill or
receiving another proposal cannot discard the pending operation; **Inspect
unresolved write** reopens it. Inspection compares actual source bytes with the
retained original/candidate and reports `source_state`, `source_sha256` and
`write_intent` separately from recorded completion. It never writes or invents a
completion receipt. Changed source disables application and recovery; an
inspected interrupted replacement can be finalized only with fresh approval.
Persisted intents let the backend reconcile an already completed replacement
without replaying it. A crash may leave a
`mutation.lock`; preserve its state and inspect the owner/process before a human
removes a stale lock. There is no automatic lock reset or recovery-data deletion.
Root identity rechecks detect some concurrent changes; they are not a race-proof
sandbox for an attacker-controlled filesystem.

## Bounds and current limits

The editable pilot supports direct packages only, 512 package
entries, 8 MiB per package and 32 KiB UTF-8 entrypoint/candidate text. It rejects
package links, hardlinks, special entries and unsafe or overlapping state.
At most 16 retained proposal directories are accepted per state directory;
at most 32 immutable review requests are retained, with no automatic pruning.
History reads bounded integrity-checked summaries; opening a proposal rechecks
its full original/candidate bytes and live state before any decision. Completion
must match the request skill and base. Read-only requests cannot link a proposal;
an enabled eligible global request can link only its matching source/root/base.
An exact completion retry is idempotent; conflicting results are rejected.
Retention and removal remain manual. Scripts are inspected inertly and never
executed for candidate validation. Full source copies can contain local/private
material: keep the state directory local and outside publication or discovery.

This first workflow has English UI, dark/light themes and a noninteractive MCP
fallback. It does not implement autonomous evolution, multi-file patches,
catalog synchronization, official validation execution, lifecycle telemetry,
signing, public hosting or provider approval. If an approved description changes,
perform the collection's explicit catalog synchronization separately.

See [architecture](https://github.com/i-9-ai/skills/wiki/Architecture),
[skill MCP](https://github.com/i-9-ai/skills/wiki/Skill-MCP) and
[validation](https://github.com/i-9-ai/skills/wiki/Validation) for their separate
contracts.
