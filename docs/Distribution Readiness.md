# CLI distribution from Git source

The prepared npm identity is `@i-9-ai/skills`, with the executable `i9-skills`.
The manifest currently sets `private:true`. No release, registry upload, marketplace
registration or global installation is authorized by a build or package test.
This npm flag prevents registry publication and is independent of GitHub
repository visibility.
The executable is the single `bin/index.mjs` launcher, exposed as `i9-skills`.
Public Git-source consumption does not require registry publication.

Checkout execution uses Node 24 native erasable TypeScript. Node does not strip
TypeScript under node_modules, so package preparation emits the same source as
JavaScript under dist. The packed allowlist excludes src and includes dist,
the launcher, distributed skill resources and public documentation. The launcher
chooses source in a checkout and built code in a packed installation; it never
compiles, downloads or installs during command startup.

## Run from an immutable public revision

Use Node.js 24+, npm and Git. Replace `<reviewed-full-commit-sha>` with the full
SHA of a reviewed public revision containing `scripts.prepare` in `package.json`.
Review the source and its dependency lockfile before the explicit download:

```sh
npx --yes --allow-git=root --package='git+https://github.com/i-9-ai/skills.git#<reviewed-full-commit-sha>' i9-skills --help
npx --yes --allow-git=root --package='git+https://github.com/i-9-ai/skills.git#<reviewed-full-commit-sha>' i9-skills catalog search --query authoring --limit 10
```

npm downloads the selected Git revision into its cache, installs its build
dependencies and runs `prepare: npm run build` before packing the CLI. This
installation lifecycle compiles the ignored `dist` directory; the source Git
tree does not contain prebuilt output. The installed artifact contains compiled
JavaScript and production dependencies. The first call therefore needs network
access to the public Git source and npm dependencies; `--yes` accepts npm's
installation prompt. A later cached invocation can use `npx --offline` with the
same exact package spec when the required cache entries are present. Cache
availability is local state, not an installation guarantee.

The examples set `--allow-git=root` for this invocation only, permitting the
selected top-level Git source while preventing transitive Git dependencies.
npm 12 defaults to blocking Git sources; npm 11.19.1 accepts the same explicit
setting. See npm's [Git-fetch configuration](https://docs.npmjs.com/cli/install/#allow-git).
The isolated Git-source checks used npm 11.19.1 and npm 12.0.2. The Node 24 check
used Node 24.21.0 and verified help, catalog search/read, project discovery and
MCP resource retrieval from a production-only install; this is local Git-source
evidence, separate from fetching the public GitHub URL after merge.

The Git-source call keeps `private: true`. The registry spellings
`npx @i-9-ai/skills` and
`npx --package='@i-9-ai/skills@<reviewed-version>' i9-skills --help` require a
separate npm publication; making GitHub public does not create that release.
Skill package installation still uses the separate pinned Skills CLI shown in
the [README](https://github.com/i-9-ai/skills/blob/main/README.md#install).

## Consumer command mapping

After the reviewed package spec above, append the same `i9-skills` command:

| Purpose | Command and explicit caller selection |
| --- | --- |
| Inspect bundled packages | `i9-skills catalog overview` or `i9-skills catalog read --skill skill-authoring` |
| Discover the caller's installed packages | `i9-skills context available-skills --project . --no-global` |
| Audit a selected collection | `i9-skills collection audit --collection ./example-skills --layout repository` |
| Inspect synthetic onboarding steps | `i9-skills skills onboarding` |
| Start the bundled catalog MCP | `i9-skills mcp serve` |

For example, project-only discovery from the caller's current directory is:

```sh
npx --yes --allow-git=root --package='git+https://github.com/i-9-ai/skills.git#<reviewed-full-commit-sha>' i9-skills context available-skills --project . --no-global
```

Bundled catalog and MCP operations locate the installed package. Commands
working on the caller's project or collection need the explicit root shown
above. Keep `node bin/index.mjs repo validate --project .`, version preparation
and other contributor commands in their trusted source checkout with explicit
`npm ci`; Git-source execution does not supply that repository's development
state. See the [CLI guide](https://github.com/i-9-ai/skills/blob/main/bin/index.md) for each command's effects and limits.

Automatic session hooks use an already available local executable or the
dependency-free installed plugin runtime. They do not run a download-capable
`npx` command. Current generated project registrations target a prepared POSIX
Git checkout; npm-installed hook registration needs a separately verified
adapter. The [hook guide](https://github.com/i-9-ai/skills/wiki/Host-Hooks) records that boundary.

## Local package verification

Run `npm ci`, then `npm run package:check`. Explicit `npm ci`, `npm install` and
ordinary `npm pack` now run the npm preparation lifecycle. Use
`npm ci --ignore-scripts` only when deliberately deferring preparation; then run
`npm run build` explicitly before packing with scripts disabled. The build first performs
strict type checking with JavaScript helper inference; its emission pass treats
existing package-owned MJS helpers as external code to avoid emitting duplicate
packages. The emission-only noCheck setting runs only after the separate strict
source check has passed; it does not replace that check. After that check the
build replaces only the disposable, ignored dist directory. Dependencies and
commands remain pinned in package.json/lockfile.

The package test starts from a disposable source copy with no `dist`, reuses
already installed build dependencies and packs with preparation enabled. It
checks the compiled allowlist, extracts into a disposable node_modules location
and copies only already installed production dependencies. It runs help,
context, hook configuration, catalog
checks, bundled catalog search/read/overview, actual MCP stdio and explicit plugin
artifact preparation with the executing Node version. Catalog/MCP tests use an
unrelated cwd and do not require host data or open a metrics store. No registry, consumer home, installed
skills, Python, or dependency installation is used by that test.

The generated local Codex environment file is excluded from this delivery
because its npm install setup was not the lockfile-driven contract. Explicit
setup is npm ci in a trusted checkout, followed by npm run check. No startup
hook invokes setup and no unreviewed environment file is part of the package.

For the existing local tarball check, run `npm ci` and then
`npm run package:check`; it creates and removes its own disposable packed install
and verifies production-only execution. To inspect an artifact manually, run
`npm run build` and `npm pack --ignore-scripts --pack-destination '<scratch-directory>'`
with an existing caller-owned scratch directory. The resulting tarball is a local
test artifact, not an npm release. Its executable supports `mcp serve`; use the
[MCP guide](https://github.com/i-9-ai/skills/wiki/Skill-MCP) for explicit client configuration and pinned future npx
syntax. Package preparation never installs a host plugin or changes a marketplace.

## Remaining external gates

Before an authorized npm release, confirm ownership of the scoped identity, version and
access, test actual target platforms and installation, inspect the packed files
again, and deliberately remove private only in that release task. The
[plugin preparation command](https://github.com/i-9-ai/skills/wiki/Plugin-Preparation) creates an optional local
skills-only artifact with verified manifest formats and inert packages. The
repository itself remains the root plugin, with one canonical package tree.
Preview/write checks and the [isolated native pilot](https://github.com/i-9-ai/skills/wiki/Native-Plugin-Pilot)
are separate evidence; neither establishes marketplace acceptance or hosted updates.

Before public visibility, separately inventory GitHub branches, PRs, issues,
discussions, releases, Actions logs/artifacts, Wiki, Pages, collaborators,
rulesets and secret names. Local clean-tree checks cannot establish remote
surface readiness. The [dated readiness audit](https://github.com/i-9-ai/skills/wiki/Public-Readiness) records the
dated inventory and evidence gaps; repeat it before an external change. The
existing Wiki workflow requires an initialized Wiki and uses `GITHUB_TOKEN`;
the visual-guide workflow pushes docs/assets to gh-pages. Both select merged
main. The audit could not establish Wiki initialization or active Pages hosting.
Their triggers must remain part of the explicit publication decision; this
assessment does not dispatch or enable them. The readiness guide separates
repository marketplaces, workspace installation and public directory submission,
including the local stdio MCP's public-submission limit.
