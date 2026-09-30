# Catalog promotion website

## Purpose

Maintain a useful promotional site for the repository's canonical meta-skill
catalog. The primary output is a reviewable static build; this subtree does not
own public hosting, registry publication or skill package procedures.

## Ownership and authority

Repository maintainers own the site. The root contract and current user request
govern source changes. A build, preview, passing test, commit, pull request or
merge never authorizes deployment. Publication requires explicit human approval
of the final rendered build and hosting target. Preserve existing visual guide
URLs and the Pages workflow until separately authorized migration work.

## Local contracts

- Source code, operator documentation, design guidance and provenance are English.
  Equivalent PT-BR and Spanish UI strings are deliberately localized.
- Derive canonical names, descriptions, counts and package links from the real
  `skills-catalog.json`. Category membership is navigation metadata and must cover
  every catalog package exactly once; drift fails the build.
- Describe skill management only. Link to domain collections as separate sources
  only when specifically authorized; do not import their skills into this repo.
- Treat `DESIGN.md` and selected generated concepts as the visual contract. Keep
  essential UI text and controls semantic/code-native and the catalog useful
  without JavaScript. Preserve original hero-asset provenance.
- Keep source English package descriptions attributable in translated pages.
  Translate all interface/editorial keys consistently and preserve language,
  fragments and filter URL state.
- Keep motion finite, optional and disabled for reduced-motion users. No content
  visibility, navigation or installation step depends on animation.
- No accounts, forms, analytics, trackers, secrets, external fonts, fake metrics,
  testimonials or universal host/production-quality claims.
- Build only to an explicit caller-owned output directory. The default is ignored
  local evidence under `.work/website-preview`. Never write `docs/assets`, a skill
  directory or Pages output. Never recursively delete a caller-supplied directory.
- Preview is loopback-only and rejects traversal/symlink escape. It is not a
  production server or public preview hosting path.

## Verification

Run synthetic build/preview integration tests in disposable fixtures. Inspect the
real site in a browser at narrow/mobile and desktop widths, with keyboard,
no-JavaScript baseline and reduced motion. Compare final screenshots with the
selected concepts and record material exceptions. Run repository checks and
independent review against the exact final commit before PR handoff.

## Child DOX index

- [README.md](README.md): source ownership and local review commands; publication remains a separate human-approved action.
- [DESIGN.md](DESIGN.md): normative visual tokens, layout and motion rules; generated references are design inputs rather than product evidence.
- [scripts/build.md](scripts/build.md): deterministic localized catalog projection; writes only the selected local static output.
- [scripts/preview.md](scripts/preview.md): loopback-only static review server; rejects traversal and never performs deployment.
- [design/README.md](design/README.md): selected original generated concept provenance and deliberate implementation exceptions; no customer or runtime proof claim.
