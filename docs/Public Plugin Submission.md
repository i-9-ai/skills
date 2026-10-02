# Prepare a public plugin submission

`plugin submission` prepares the selected public profile's complete meta-skills for
manual upload to the official public plugin directory. The existing repository
marketplace remains available through its root plugin. This public projection
contains root portable and compatibility manifests, a product icon, bundled
skills with their assets and licenses, and an artifact receipt. It has no root
hooks, including
`hooks/hooks.json`, local MCP declarations, apps, repository runtime, or local
evidence state. Installing it does not start telemetry or the local catalog MCP.
Known workspace/state folders, environment files and database files inside a
skill package are rejected rather than silently dropped from a required resource.

The public profile deliberately excludes the entire optional `skills-usage-setup`
package, whose purpose includes persistent host-command registration. This is a
conservative distribution choice following a portal security-risk finding with
no diagnostic cause, not a provider rule prohibiting such a skill or proof of
scanner acceptance. Both receipts name the omitted package and its reason.
The complete repository plugin and npm package retain all 25 skills and the
explicit local setup capability; this public ZIP contains 24. No retained skill
is selectively rewritten or stripped of its required resources.

Listing metadata comes from the canonical `.codex-plugin/plugin.json` interface
and is emitted in full into root `extensions.com.openai.interface` and the
compatibility interface. The root extension takes precedence at the portal.
The 26-character subtitle is **Author and maintain skills**. Both `logo` and
`composerIcon` reference the included `assets/plugin-icon.png` (512 × 512), which
is checked as a complete PNG before staging. Metadata lengths, HTTPS URL syntax
and the closed presentation extension are checked locally; URL accessibility
and policy contents must still be verified on the deployed website.

The website, privacy policy and terms are published at
[skills.i-9.ai](https://skills.i-9.ai/),
[privacy](https://skills.i-9.ai/privacy/) and
[terms](https://skills.i-9.ai/terms/). Support is the public
[repository issue tracker](https://github.com/i-9-ai/skills/issues).
The privacy policy distinguishes optional metadata-only local observations from
agent-provider processing and hosting-provider request logs.

Use an owned, existing neutral parent and a new `i9-skills` child:

```sh
mkdir -p .work/public-candidate
node bin/index.mjs plugin submission --output .work/public-candidate/i9-skills
node bin/index.mjs plugin submission --output .work/public-candidate/i9-skills --write
```

`--root` can select an I-9 Skills checkout or unpacked CLI package. The default
is the shared project/package selection. The first invocation reports the exact
planned archive size/digest and writes nothing. `--write` creates:

```text
.work/public-candidate/
  i9-skills/                    # complete portable plugin
  i9-skills.zip                 # ZIP entries start at plugin.json and skills/
  i9-skills-submission.json     # archive and inventory integrity summary
```

All three outputs must be absent before either preview or write. The existing
artifact contract rejects host discovery directories, linked outputs and unsafe
parents. Reuse a new neutral parent for each candidate. Source validation occurs
before creation; a failed write retains its new partial outputs for inspection.
The command never repairs, deletes or overwrites an earlier candidate.

The ZIP uses Node.js built-ins: ZIP32 stored entries, CRC32 checksums, sorted
UTF-8 paths, fixed January 1, 1980 timestamps and normalized 0644/0755 file modes.
This avoids dependencies, external build commands and machine-dependent ZIP
metadata. It includes no archive comments, extra fields, links or empty
directories. Bounds are 10000 files, 4 MiB per file, 64 MiB total content and
128 MiB encoded archive; individual package bounds still apply. Independent
`unzip` tests check extraction, checksums, byte identity and modes. The integrity
summary records the archive SHA-256 and existing artifact inventory SHA-256,
without source paths or timestamps. It is unsigned evidence of the prepared
bytes, not publisher authentication.

The official [package guide](https://developers.openai.com/plugins/build/plugins)
supports portable root `plugin.json` and `skills/`, with the Codex compatibility
manifest as fallback. It auto-discovers `hooks/hooks.json` when no hook field is
declared, so omission of manifest hook fields alone is insufficient. Public ZIPs
with lifecycle hooks or app references are currently unsupported; local MCP
requires an OpenAI-specific support path. These constraints were checked on
2026-10-02. The skills-only artifact excludes those components structurally.
The portal's “No MCPs connected” message is expected for this distribution.
Launching `npx @i-9.ai/skills mcp serve` is supported for an explicitly configured
local client; it does not create the remote HTTPS endpoint required by the
public portal or attach one to the submitted plugin. See the
[local MCP configuration](https://github.com/i-9-ai/skills/wiki/Skill-MCP#start)
for registration and duplicate-server limits.
The local catalog/evidence server remains in the full repository plugin; it is
not a remote endpoint. The current submission process also does not support
adding MCP to an existing skills-only plugin. A hosted service or supported local
submission would need its own reviewed architecture and initial submission path.

For the human delivery steps, follow the official
[submission process](https://developers.openai.com/plugins/deploy/submission):
select the owning organization/project and verified publishing identity in
[Plugins](https://platform.openai.com/plugins), upload the ZIP, resolve automated
findings, submit the draft for review, and publish only an approved version.
Local structural validation and archive integrity do not establish acceptance.
Skills, metadata and asset updates require a new complete ZIP uploaded to the
existing plugin, with the applicable checks and review. Keep reviewer credentials
outside public files. This command does not upload, submit, publish, or record an
approval claim; its summary says `not_submitted` and `unverified`.

`codex-marketplace.com` is a separate third-party directory, not the official
OpenAI submission portal. Any requested listing there remains pending and
requires a separate authorized submission. No third-party listing or official
approval is implied by generating this artifact.

See [plugin preparation](https://github.com/i-9-ai/skills/wiki/Plugin-Preparation)
for the shared source validation, portable layout and local marketplace surface.
