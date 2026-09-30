# I-9 Skills promotion site

This is a local-review static site for the repository's meta-skill collection.
It is not deployed. The existing Pages visual guides and their publishing
workflow remain separate.

## Review locally

From the source checkout with Node.js 24+ and repository dependencies installed:

~~~sh
npm run site:build
npm run site:preview
~~~

Open http://127.0.0.1:4173/. English is available at / and /en/, Portuguese
at /pt-br/, and Spanish at /es/. The preview listens on loopback only.
Stop it with Ctrl-C.

The direct Node commands need no third-party site dependencies:

~~~sh
node website/scripts/build.mjs --help
node website/scripts/build.mjs --out-dir .work/website-preview
node website/scripts/preview.mjs --root .work/website-preview --port 4173
~~~

See the [build guide](scripts/build.md) and [preview guide](scripts/preview.md)
for ownership checks, inputs, failure recovery and arguments. Generated output
is ignored local evidence and must not be committed.

## Source ownership

- content.mjs owns localized interface/editorial messages, exhaustive catalog
  category assignments and documented manual install commands.
- render.mjs produces semantic HTML, escaped descriptions, native language and
  source links, and a complete no-JavaScript catalog.
- assets/site.css implements [DESIGN.md](DESIGN.md).
- assets/site.mjs adds filtering, URL/language-state preservation,
  clipboard feedback and finite reduced-motion-aware entrance.
- assets/catalog-state.mjs owns search matching and localized result counts,
  shared with the renderer and synthetic regression tests.
- scripts/build.mjs reads the actual skills-catalog.json and existing
  canonical package icons. It does not maintain a second inventory.
- [design/README.md](design/README.md) records generated design references,
  original asset provenance and deliberate factual/accessibility exceptions.

When catalog membership changes, update category coverage before rebuilding.
Canonical names, descriptions, counts and icon paths are regenerated.
Translated pages deliberately retain original English package descriptions and
state their source language; every interface and editorial message is localized.
This preserves source responsibility and avoids silent translation drift.

The Toolkit CLI command uses the published @i-9.ai/skills registry package. The
0.1.0 release passed fresh-cache CLI and MCP consumer checks before this CTA was
enabled. The root plugin, Skills CLI and toolkit CLI remain distinct install/run
paths with documented prerequisites. For unreleased development only, a Git
source fallback requires Git and preparation dependencies:

~~~sh
npx --yes --allow-git=root github:i-9-ai/skills catalog overview
~~~

## Verification

~~~sh
npm run site:test
npm run check
npm run changeset:status
git diff --check
~~~

Website integration tests use disposable synthetic catalogs/assets and a temporary
loopback server. They exercise locale coverage, escaping, deterministic builds,
catalog drift, refusal to overwrite caller/source state, symlinks, active icons,
traversal and artifact integrity.

Browser review checks English/PT-BR/Spanish, search/filter/reset/empty states,
query and section preservation, copy success/failure, keyboard, 375 px mobile,
desktop, no JavaScript and reduced motion. Functional testing does not replace
comparison with the selected design references.

## Publication boundary

The build includes noindex and a disallowing robots.txt because it is a review
artifact. There is no deployment workflow, production origin, sitemap, tracking,
form, account, payment or runtime backend.

Publication requires explicit human approval of the final rendered build and its
target. That decision must cover build SHA, host/path, preservation of existing
visual-guide URLs, canonical metadata/indexing and rollback. Merging this source
does not authorize a site deployment.
