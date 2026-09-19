# Prepare a local plugin artifact

`plugin prepare` makes the repository's reviewed skill collection available as
a separate, inspectable plugin artifact. Preparation does not install a plugin,
register a marketplace, enable a hook, contact an MCP server or publish content.
The npm CLI and the plugin remain separate distribution units.

After explicit checkout setup, select a new neutral staging directory:

```sh
mkdir -p .work/plugin-preview
node bin/index.mjs plugin prepare --output .work/plugin-preview/i9-skills
node bin/index.mjs plugin prepare --output .work/plugin-preview/i9-skills --write
```

The first command only previews the manifest, package/file counts, destination
and inventory digest. `--write` creates the artifact. The parent directory must
already exist, and its new child must be named `i9-skills`. An existing child,
including a link, is an error. Use another parent for a later candidate.
`--root` selects an I-9 Skills checkout or unpacked npm package; otherwise the
shared project configuration selects `I9_SKILLS_PROJECT_ROOT` or the CLI's own
package. Generation also works from the compiled npm artifact.

The generated layout is:

```text
i9-skills/
  plugin.json
  .codex-plugin/plugin.json
  artifact-receipt.json
  LICENSE
  skills/
    <actual-catalog-name>/
      SKILL.md
      LICENSE
      ...complete package resources and scoped notices...
```

The catalog is checked for freshness. Each package passes the local package
validator, and all package bytes are inspected before any output is created.
Only actual catalog packages and the root license/optional notice are included.
Repository instructions, CLI implementation, host configuration and local logs
are excluded. Package scripts are copied as inert bytes and never executed.

Root `plugin.json` targets Agent Plugins 1.0.0 with discovery through `skills/`.
The compatibility manifest declares the same identity/version and skills path,
plus minimal OpenAI presentation metadata. Both derive shared fields from
package.json. Neither advertises hooks, apps, MCP connections or model gains.
The [official packaging contract](https://developers.openai.com/plugins/build/plugins)
and [portable manifest schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json)
were checked on 2026-09-19; native ingestion and UI rendering remain untested.

`artifact-receipt.json` records sorted paths, byte sizes, normalized file modes
and SHA-256 digests. Its inventory includes both manifests and excludes the
receipt itself to avoid a self-hash. It contains no absolute source paths or
timestamps. Repeating a preview over unchanged bytes yields the same digest.
Files use 0644, or 0755 when the source has an executable bit; the staging root
is private to its owner. Source links, hard links and special files are rejected.
Package limits remain 4 MiB per file and 32 MiB per package; the aggregate is
bounded to 64 MiB and 10000 files. Reads use the existing stable-workspace
filesystem checks, which do not claim confinement against hostile concurrent
mutation.

Known host discovery paths are refused as staging destinations. Select an owned
scratch directory and keep other writers away during preparation. A failed
write retains its new partial directory for inspection and returns nonzero;
manifests are written last. Never install a partial artifact. The command does
not delete, overwrite, repair or clean existing artifacts.

## Verification and future marketplace use

`npm run check` exercises preview, source rejection, no-overwrite and exact
package byte preservation with disposable data. `npm run package:check`
generates the complete plugin from the actual compiled npm package under
node_modules, using only already installed production dependencies.

For a release candidate, run the available plugin-creator compatibility
validator on the generated folder and check root plugin.json against the
official portable schema. Record the executable/schema identities and results
outside distributed packages. Run official `skills-ref validate` on every
bundled skill. These structural checks do not replace an explicitly authorized
installation test in each intended consumer.

The inert [marketplace example](examples/plugin-marketplace.json) describes a
future repository marketplace whose plugin artifact would live at
`plugins/i9-skills`. Its path is relative to that future marketplace's repository
root. This documentation file is not a registered marketplace. A separate
authorized installation task must select the destination, review existing
entries, copy the verified artifact, apply the host's current registration
contract and verify discovery. Do not copy it into an active host configuration
as part of preparation. Public directory submission and workspace publication
remain separate authorization boundaries.
