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
do not silently turn the panel or its write operations on. Normal catalog and
telemetry operations keep their existing contracts.

Open `skill_panel_open` in an MCP Apps-capable host. A plain MCP client can read
its structured result and the fixed `ui://i9-skills/skill-panel/v1.html` resource.
Opening the panel does not enable hooks, record usage or create a database.
No remote assets, model call or network service are required by the panel.

## Review a real candidate

1. Select a skill. The panel reads actual `SKILL.md` content, file count, byte
   count and an exact package fingerprint including ordinary file modes.
2. **Prepare a review** produces an editable task bound to that source. It does
   not send a message or run an agent. A review can conclude no edit is needed.
3. **Plan an evolution** opens the real entrypoint. Supply complete candidate
   text and a rationale, or ask the authoring agent to use `skill_panel_propose`
   with the exact inspected package `base_sha256`. The backend does not generate
   text or call a model. Only `SKILL.md` can change; preserve the package name.
4. **Preview and validate** retains the original and candidate packages in the
   private state directory and returns their before/after content, unified diff
   and local package-helper validation. It does not edit the selected source.
5. Inspect the diff and actual checks. Official Agent Skills conformance and
   behavioral evaluation are explicitly `not_run` by this pilot; a local
   structural pass cannot establish semantic quality or release readiness.
   A failed local check disables application. Run required official and task
   validation separately before accepting a package for distribution.
6. Acknowledge the exact diff and limits, then choose **Apply approved change**.
   The backend verifies the entire package, retained artifacts and approval
   hashes again before replacing the entrypoint. Editing the candidate or
   changing selection clears UI consent. No approval is inferred from a task
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
state** before another write. Persisted intents let the backend reconcile an
already completed replacement without replaying it. A crash may leave a
`mutation.lock`; preserve its state and inspect the owner/process before a human
removes a stale lock. There is no automatic lock reset or recovery-data deletion.
Root identity rechecks detect some concurrent changes; they are not a race-proof
sandbox for an attacker-controlled filesystem.

## Bounds and current limits

The pilot supports direct packages only, up to 64 catalog results, 512 package
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
