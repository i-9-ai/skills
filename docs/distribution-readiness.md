# Local package distribution preparation

The prepared npm identity is `@i-9-ai/skills`, with the executable `i9-skills`.
The npm package remains private. No release, registry upload, marketplace
registration or global installation is authorized by a build or package test.
The currently usable executable is the single bin/index.mjs launcher.

Checkout execution uses Node 24 native erasable TypeScript. Node does not strip
TypeScript under node_modules, so an explicit build emits the same source as
JavaScript under dist. The packed allowlist excludes src and includes dist,
the launcher, distributed skill resources and public documentation. The launcher
chooses source in a checkout and built code in a packed installation; it never
compiles, downloads or installs during command startup.

Run npm ci, then npm run package:check (which includes the build). The build first performs
strict type checking with JavaScript helper inference; its emission pass treats
existing package-owned MJS helpers as external code to avoid emitting duplicate
packages. The emission-only noCheck setting runs only after the separate strict
source check has passed; it does not replace that check. After that check the
build replaces only the disposable, ignored dist directory. Dependencies and
commands remain pinned in package.json/lockfile.

The package test packs without lifecycle scripts, checks its allowlist, extracts
into a disposable node_modules location and copies only already installed
production dependencies. It runs help, context, hook configuration, catalog
checks and explicit plugin artifact preparation with the executing Node version. No registry, consumer home, installed
skills, Python, or dependency installation is used by that test.

The generated local Codex environment file is excluded from this delivery
because its npm install setup was not the lockfile-driven contract. Explicit
setup is npm ci in a trusted checkout, followed by npm run check. No startup
hook invokes setup and no unreviewed environment file is part of the package.

The local packed test uses the actual scoped node_modules layout. A future
authorized published version can be invoked with an explicitly pinned package:
`npx --package=@i-9-ai/skills@<reviewed-version> i9-skills --help`.
This is a release recipe, not an available registry release. It may download
software and therefore never belongs in an automatic session hook. Installed
hooks use an already available executable or the checkout launcher.

## Remaining external gates

Before an authorized npm release, confirm ownership of the scoped identity, version and
access, test actual target platforms and installation, inspect the packed files
again, and deliberately remove private only in that release task. The
[plugin preparation command](plugin-preparation.md) creates a separate local
artifact with verified manifest formats and inert packages. Its preview and
write checks do not establish native plugin ingestion or marketplace acceptance.

Before public visibility, separately inventory GitHub branches, PRs, issues,
discussions, releases, Actions logs/artifacts, Wiki, Pages, collaborators,
rulesets and secret names. Local clean-tree checks cannot establish remote
surface readiness. The [dated readiness audit](public-readiness.md) records the
current inventory and evidence gaps; repeat it before an external change. The existing Wiki workflow mirrors docs to the initialized
Wiki using its separate token; the Pages workflow pushes docs/assets to
gh-pages. Both select merged main. Their effects must remain part of the
explicit publication decision; this task does not run or enable them.
