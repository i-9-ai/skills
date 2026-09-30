# Static catalog build

## Purpose and prerequisites

Render the site from the current catalog and authored locales into a caller-owned
static directory. Requires Node.js 24+. Uses only built-in Node modules and
local files, with no installation, network, host configuration or publishing.

## Inputs and invocation

~~~sh
node website/scripts/build.mjs
node website/scripts/build.mjs --out-dir .work/another-site-preview
node website/scripts/build.mjs --out-dir .work/production-site --public-url https://example.pages.dev
node website/scripts/build.mjs --help
~~~

Default output is .work/website-preview under this checkout. Relative output
resolves from the checkout, not the shell directory. Absolute caller-owned
output paths are accepted after confinement/ownership checks.

Without a public URL, builds use review indexing. `--public-url` or the
`I9_SITE_PUBLIC_URL` environment variable explicitly selects production metadata;
the argument takes precedence. Select that environment variable only for the
provider's production environment. The URL must be an HTTPS origin with no
credentials, path beyond `/`, query or fragment. This selection never deploys.

Inputs are skills-catalog.json, content.mjs, render.mjs, the bundled runtime assets
and each canonical package's assets/icon.svg. The catalog must use schema version
1, safe canonical names and the exact .agents/skills/name path. Every name needs
one explicit category. Missing, extra, duplicate or unsafe membership fails before
writing. Locale message key/type coverage must match.

## Output and side effects

Creates complete root/English, PT-BR and Spanish HTML, shared local assets,
current icons, robots.txt and .i9-site-build.json. Review output disallows indexing;
production output adds canonical locale URLs, public share metadata and sitemap.xml.
The marker records catalog/file hashes, count, locales, mode, selected public URL
and publication: not-deployed. It contains
no private source path.

Writes only known artifact names. A new output or empty directory is accepted.
Existing output needs a valid ownership marker, and every prior owned file must
match its hash. Unknown files are preserved; conflicting unowned names refuse the
rebuild. Stale unchanged owned files may be unlinked individually. There is no
recursive output deletion.

Project source (including nonexistent or empty reserved scopes), canonical skills,
Git metadata, visual-guide sources and staging, ancestor
directories and symbolic-link paths are refused. Active/external SVG icon content
is rejected before copying. Use one writer and do not mutate output concurrently.

## Failure recovery and verification

Catalog/locale/source/ownership checks finish before writing. Correct the source
error and rerun. Caller-modified output is preserved: inspect it, retain edits
separately and choose a fresh output. Do not remove the marker to force overwrite.

Files use sibling temporary writes and atomic rename. An I/O failure can leave a
partial candidate; keep it for inspection and build into a fresh directory. The
marker updates last. Recovery must never delete unowned files.

~~~sh
npm run site:test
node website/scripts/build.mjs
node website/scripts/build.mjs
~~~

A second successful build has identical artifact/marker hashes. Inspect the
browser-rendered candidate before publication. This script never publishes.
