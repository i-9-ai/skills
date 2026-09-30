# Catalog promotion website

Related issue: [#62](https://github.com/i-9-ai/skills/issues/62)

## Objective

Give builders and teams a concrete way to understand I-9 Skills, find a focused meta-skill and choose a documented manual installation path. The site promotes this repository and its existing tools; it does not become a registry or widen the collection beyond skill management.

## Scope and authority

Deliver a reviewable static site, complete visual specification, original generated design exploration, deterministic catalog projection, multilingual interface and local browser preview. Implementation and PR creation are authorized. Site deployment, public preview hosting, merging, DNS changes, Pages configuration and production routing require separate explicit approval. Preserve the existing visual guides and their publishing workflow byte for byte.

No accounts, lead forms, analytics, trackers, payments, external font requests, frameworks, animation libraries or new material runtime dependencies. No universal host, production-quality or productivity claim. npm status is a release dependency to verify immediately before writing install copy.

## Audience and visitor journeys

| Visitor | Need | Reviewable destination |
| --- | --- | --- |
| Builder starting a skill | A small, complete package | Catalog → create filter → package SKILL.md |
| Team inheriting a collection | Incremental improvement | Lifecycle → audit/refactoring/evolution packages |
| Agent maintainer | Portable packages or richer host adapter | Install → package/plugin/toolkit distinction → documented commands |
| Reviewer | Evidence and boundaries | Evidence section → compatibility, pilots and validation docs |

## Information architecture

One complete landing page per language, in this order:

1. **Opening:** navigation and language links, large clear headline, concise method promise, primary catalog CTA and install link, original modular-object illustration. No fake dashboard, metrics or product proof.
2. **Lifecycle:** four open columns with ordinal numbers and real links: Create → Verify → Improve → Distribute. State that a visitor can start with an existing collection and change only what evidence supports.
3. **Catalog:** searchable, grouped list of all current canonical packages with distinct existing package icons, canonical names, exact source descriptions and public SKILL.md links. Visible result count, category filter, reset and empty state. Source English remains explicitly identified on translated pages.
4. **Installation:** separate portable Skills CLI, Codex root plugin and toolkit CLI lanes with their prerequisites, commands, verification and supported host limits. Clipboard buttons provide real success/failure feedback; ordinary selectable code is the no-JavaScript baseline. More detailed Claude/Copilot material links to the canonical plugin/compatibility docs.
5. **Evidence and footer:** portable-core explanation, what checks prove, experimental status, concrete provider pilot limitations and documentation/source/license links. No testimonials or unverified comparisons.

## Routes and localization

- `/index.html` and `/en/index.html`: English, each fully rendered and useful without a client router.
- `/pt-br/index.html`: PT-BR interface and editorial copy.
- `/es/index.html`: Spanish interface and editorial copy.
- Stable fragment identifiers: `#workflow`, `#catalog`, `#install`, `#evidence` in every language.
- Language links preserve the current fragment and catalog query/category parameters. Default links work without JavaScript.
- Search state uses URL parameters `q` and `category`; clear restores all entries.
- Each document declares `lang`; `hreflang` targets use relative paths because a production origin has not been approved. Canonical production URL, sitemap and public social URL remain pending deployment approval.
- All authored source/operator documentation is English. Translated UI strings are deliberate user-requested localization, with matching key coverage checked by tests. Canonical names and source descriptions come directly from the catalog; translations never become a second skill inventory.

## Components and data ownership

| Component | Source of truth | Behavior |
| --- | --- | --- |
| Header/languages | locale message map | Native links, preserved section and catalog state |
| Hero | locked copy and original image | No invented badge or eyebrow; static image |
| Lifecycle rail | explicit four-stage link map | Hover/focus highlight; no autoplay or scroll lock |
| Catalog controls | canonical catalog and category map | Search exact names, descriptions and tags; text labels |
| Catalog rows | `skills-catalog.json` and package icon files | Count and description regenerated every build |
| Install blocks | documented release/provider state | Text selection and progressive clipboard enhancement |
| Evidence/footer | public evidence references | Distinguish structure, behavior, provider pilots and production |

Category map is navigation metadata, not inventory. Every canonical catalog name must occur exactly once in `Create`, `Evaluate`, `Manage`, `Evolve` or `Distribute`; unknown, duplicated or missing membership fails the build instead of hiding a new package. Current categories cover 7, 4, 7, 3 and 3 packages respectively.

## Technical architecture

Use a small build-time static renderer with Node.js built-ins. This repo's supported Node 24 runtime already exists. A framework would add runtime, dependency and maintenance cost without helping this bounded content/catalog surface.

`website/scripts/build.mjs` reads the public catalog, verified package metadata, authored locale messages and assets; validates category coverage, locale keys and safe package paths; creates fully rendered pages and shared CSS/JS in a selected caller-owned output directory. Output is `.work/website-preview` by default, never `docs/assets`, `gh-pages`, source directories or an arbitrary directory to delete. Writes use explicit known output names; the build never performs a recursive deletion of a caller-supplied path.

`website/scripts/preview.mjs` serves the chosen local output at `127.0.0.1:4173`, rejects path traversal, allows only ordinary static files, prints its local URL and never listens on all interfaces. This is a review server, not a production hosting mechanism. Relative assets/routes make a future subpath deployment possible without replacing the existing guide site.

Client JS is a small progressive enhancement for filtering, URL state, clipboard feedback and finite reveal motion. Semantic page content, all catalog entries, language links, installation code and critical destinations render at build time. No fetch/API service, service worker, persistence, cookies or network-loaded code.

## Visual and motion contract

Direction: a contemporary field manual with paper-white canvas, forest-ink type, acid-lime signal color, oversized disciplined type and one original sculptural illustration of modular skill packages. Page rhythm alternates an open hero, an ink lifecycle band, a dense useful catalog and restrained installation/evidence areas. `DESIGN.md` locks tokens after concept inspection.

Motion clarifies structure and feedback: finite opening rise, short catalog/result transitions and lifecycle focus feedback. All content remains visible before enhancement and with JavaScript disabled. Under `prefers-reduced-motion: reduce`, transitions and entrance effects are disabled. No infinite animation, parallax, WebGL, canvas, scroll hijacking or animation-dependent content. Offscreen effects do not keep running.

Budgets: shared JS ≤ 15 KiB uncompressed, shared CSS ≤ 25 KiB uncompressed, hero image ≤ 250 KiB after optimization where native tooling permits; no external font/CDN or runtime dependency. First render reserves image dimensions. Target widths 375, 768 and 1440 px. Contrast ≥ 4.5:1 for ordinary text, ≥ 3:1 for large text/interactive indicators; visible keyboard focus and minimum 44 px principal targets. Browser measurements describe the observed local environment only.

## Instruction map

Current map retains repository root authority plus `.agents`, `plans`, `src` and `tests` contracts. Public docs remain under the existing documentation guidance. No contract currently owns a promotional website.

Target: create **one** `website/AGENTS.md` for the durable promotion surface, generated-output ownership and explicit publication boundary. Root adds one Child DOX link. The website index links its design and source/operator guide. Do not create contracts for assets, styles or each locale; no skill entrypoints are changed or added. Build/preview have same-basename Markdown guides because their output and binding safety matter.

Reading route: root → `website/AGENTS.md` for website files; root → `plans/AGENTS.md` for the plan; root → `tests/AGENTS.md` for integration coverage. Retain all existing package `SKILL.md` entrypoints.

## Intended file scope

- `plans/<UTC timestamp>-catalog-promotion-site.md` and a plan index link.
- Root `AGENTS.md`: one website Child DOX entry.
- `website/AGENTS.md`, `website/README.md`, `website/DESIGN.md`, `website/tokens.json`.
- `website/content.mjs`, shared styles, progressive browser script and original optimized hero asset/provenance receipt.
- `website/scripts/build.mjs`, `build.md`, `preview.mjs`, `preview.md`.
- `website/design/`: selected generated section concepts and an English provenance/fidelity note, using a small reviewed subset.
- Meaningful synthetic integration tests under the applicable tests contract.
- A Changeset describing multilingual promotion, generated catalog and local-only preview.
- Optional package scripts for local build/preview only after release changes settle; no publishing workflow.

Do not alter `docs/assets/**`, `docs/diagrams/**`, the existing Pages workflow, registry release code, host plugin manifest, catalog metadata or any skill package.

## Implementation sequence

1. Verify issue #62, current release status and authorized branch ownership.
2. Finish architecture, generated section concepts and design-token extraction in scratch.
3. In the granted feature branch, add plan and minimal website contract/index before implementation.
4. Implement the deterministic static renderer, locales and catalog projection; render the unchanged inventory.
5. Implement the selected design section by section, compare local screenshots and repair material drift.
6. Test routing/state, no-JS content, clipboard behavior, keyboard, narrow layout and reduced motion.
7. Run explicit `npm ci`, repository `npm run check`, Changesets status, `git diff --check`; official skills-ref is unchanged-package scope and existing CI remains authoritative.
8. Commit, obtain independent review of the exact commit, fix findings and repeat affected checks.
9. Push/create the authorized PR, attach it to the chat, reconcile local/effective remote/PR SHAs and report local-preview evidence. Keep site publication pending human approval of rendered build and target.

## Verification and retained evidence

Synthetic tests use disposable directories and a generated test catalog: category coverage, duplicate/unsafe paths, locale parity, HTML escaping, relative language routes, deterministic output, complete no-JS catalog, preview traversal refusal and loopback binding. They do not modify real home directories, installed skills or production.

Browser QA inspects EN/PT-BR/ES, package links, filters/search/clear/empty state, query preservation, copy success/failure, keyboard focus, 375 px mobile, 1440 px desktop and reduced-motion state. Keep concept-versus-render comparison covering composition, typography, palette, spacing, illustration and catalog density. Store temporary screenshots and reports in ignored local evidence; selected concepts and provenance are durable design inputs.

Acceptance remains blocked until the complete site implementation and exact-commit review exist. A generated concept, passing structural check or local preview is not published site evidence.

## Removal and future publication

Rollback is a source revert of the website files, tests, Changeset and two index additions; no installed state, remote hosting or production route needs recovery. A future publication decision must state approved build SHA, host/path, preservation of visual-guide URLs, canonical URLs, preview-vs-live indexing, operator and rollback. This PR cannot silently supply that authorization.
