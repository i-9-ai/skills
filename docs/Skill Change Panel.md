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
candidate is explicitly retained, not when the panel opens.

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
pilot mode exposes only its six panel tools; unrelated evidence/database writes
are unavailable. Without these flags, the normal catalog and telemetry MCP keeps
its existing tools and contracts.

Open `skill_panel_open` in an MCP Apps-capable host. A plain MCP client can read
its structured result and the fixed `ui://i9-skills/skill-panel/v1.html` resource.
Opening the panel does not enable hooks, record usage or create a database.
No remote assets, model call or network service are required by the panel.

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
resolve every fill and outline; no external image request, font or local absolute
path is needed. A supporting host can use it for the native entry, including
monochrome presentation. Actual display and caching depend on that host.
Missing optional branding falls back to its generic icon without disabling the
panel. The public listing/site cube logo is unchanged; plugin listing `logo` and
`composerIcon` describe separate presentation surfaces.

## Include read-only global skills

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
references remain read-only. Before creating proposal state or acquiring a write
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

Use **All skills**, **Selected copies** or **Global · read only**, then
search by human name or description. **Refresh catalog** reloads available
pages from actual source metadata. The MCP tool accepts optional integer `offset`
and `limit` (1–128, default 128), returning `total` and `next_offset`. Plain clients
must follow `next_offset` until null. The combined catalog is bounded at 1,024
packages, with 4,096 inspected directory entries per source, and reports incomplete coverage or broken sources;
catalog descriptions are shortened to 256 code points for display.
The UI checks `catalog_revision` between pages and requests a fresh load when
source metadata changes during pagination.

Selecting a global reference reads only its bounded UTF-8 `SKILL.md` (128 KiB),
with its entrypoint hash, rather than asserting a complete package fingerprint.
Returned text preserves exact UTF-8 bytes, including a leading BOM; parsing
normalizes only a separate metadata view.
**Prepare a review** drafts an unsent read-only request. **Plan an evolution** is
disabled for these references, and the backend rejects global IDs for candidate
writes. The existing selected-package workflow below retains its explicit approval
and recovery rules. A global reference does not need this repository's icon or
license layout to appear. Its text is source material, never permission to run a
script, modify a package or broaden access. No global catalog or usage state is written.

## Review a real candidate

The compact library stays beside one skill workspace on desktop and stacks above
it at narrow widths. **Overview** explains the source boundary and exposes the
inspected identity. **SKILL.md** shows the last inspected read-only entrypoint;
it does not claim to observe later disk changes automatically.
**Compare candidate** becomes available after starting an evolution or opening a
retained proposal. Arrow keys, Home and End move through available workspace
tabs. Source filters and search operate on the loaded real catalog, without
inventing categories, quality scores or related-skill recommendations.

1. Select a skill. The panel reads actual `SKILL.md` content, file count, byte
   count and an exact package fingerprint including ordinary file modes.
2. **Prepare a review** produces an editable task bound to that source. It does
   not send a message or run an agent. A review can conclude no edit is needed.
3. **Plan an evolution** opens an editor in the same workspace. Supply complete candidate
   text and a rationale, or ask the authoring agent to use `skill_panel_propose`
   with the exact inspected package `base_sha256`. The backend does not generate
   text or call a model. Only `SKILL.md` can change; preserve the package name.
4. **Preview and validate** retains the original and candidate packages in the
   private state directory and returns their before/after content, unified diff
   and local package-helper validation. It does not edit the selected source.
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
   comparison remains accessible and the server retains its ID and artifacts.
   No approval is inferred from a task
   draft, model output or earlier proposal.

The agent may prepare a candidate; applying and restoring are advertised as
app-only tools and belong to an explicit operator action. `ui.visibility` is
discovery metadata, not authentication: an arbitrary MCP client can assert
approval. Use this pilot only inside the trusted local host and stable owned
workspace. Do not expose its stdio input as an unauthenticated remote service.

## Recovery and interruption

The result contains a proposal UUID. Retain the entire private state directory:

```text
proposals/<proposal-id>/
  before/<skill>/        preserved original package
  candidate/<skill>/     supplied candidate package
  proposal.json         byte-bound proposal and observed local validation
  applying.json         write intent, if application was requested
  applied.json          completed application, when observed
  recovering.json       recovery intent, when requested
  recovered.json        completed recovery, when observed
```

Use **Open retained proposal** with that UUID after reopening the panel. After
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
retention and removal remain manual. Scripts are inspected inertly and never
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
