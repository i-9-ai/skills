# I-9 Skills promotion site

This is a static site for the repository's meta-skill collection. Local builds
support pull-request review; GitHub Pages publishes the catalog and existing
visual guides from `main`. Cloudflare Pages supplies independent Git previews
and a production mirror when configured.

## Review locally

From the source checkout with Node.js 24+ and repository dependencies installed:

~~~sh
npm run site:build
npm run site:preview
~~~

Open http://127.0.0.1:4173/. English is available at / and /en/, Portuguese
at /pt-br/, and Spanish at /es/. The preview listens on loopback only.
Stop it with Ctrl-C.

The unprefixed root offers a dismissible language suggestion when the browser's
first supported language is Portuguese or Spanish. It preserves catalog query
and section state, never redirects, and is suppressed on explicit locale URLs.

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
- assets/language-state.mjs owns browser-language matching and suggestion links,
  without persisted preferences or automatic redirects.
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

The portable package command is `npx skills add i-9-ai/skills --yes`.
`--yes` selects all available skills; `--skill '*'` adds no selection behavior.
Use `--global` for the user's global scope and `--skill <name>` for a subset.

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

## GitHub Pages production

`.github/workflows/publish-website.yml` publishes the website from merged main
through official Pages artifact and deployment actions. Set the repository Pages
source to GitHub Actions. The build reads the configured Pages base URL, so locale,
asset, canonical and sitemap URLs support `/skills/`. Verified visual guides are
included at their existing filenames; the old guide index does not replace the
catalog homepage. Deployment permissions are confined to the deploy job.

## Cloudflare Git delivery

Use Cloudflare Pages' native GitHub integration for this repository. No custom
upload workflow or repository deploy token is needed. Configure:

| Setting | Value |
| --- | --- |
| Build command | `npm run site:build` |
| Output directory | `.work/website-preview` |
| Production branch | `main`, automatic builds enabled |
| Initial preview branch | `codex/catalog-promotion-site`, custom preview control |
| Pull-request comments | Enabled |
| Both environments | `NODE_VERSION=24.21.0`, `SKIP_DEPENDENCY_INSTALL=1` |
| Production only | `I9_SITE_PUBLIC_URL=https://i9-skills.pages.dev` |
| Preview environment | `I9_SITE_PUBLIC_URL` absent |

Dependency installation can be skipped because the website build uses only Node
built-ins. The source still uses explicit `npm ci` for contributor validation.
Production URL selection enables canonical locales, share metadata, an allowing
robots file and sitemap. Default local and PR builds remain `noindex`; their
robots file disallows crawling. The ownership manifest says `not-deployed` in
both modes because a build cannot prove deployment.

Native Git previews are public and attach provider checks/comments to PRs. Verify
the deployment's actual commit before sharing its URL. A project setting or
successful local build does not prove a successful provider build. Production
requires the website source to merge into `main`; keep PR #67 open for the
maintainer's review. Do not deploy the current pre-website main tree.

Hosting both previews and main production was explicitly authorized in the
[delivery plan](../plans/2026-09-30-18-31-35-cloudflare-site-delivery.md).
This does not authorize DNS changes or migration of existing GitHub Pages guides.
There are no trackers, forms, accounts, payments or runtime backend. To stop
delivery, disable branch build controls; retain the last verified deployment for
rollback. Project deletion remains a separate action.
