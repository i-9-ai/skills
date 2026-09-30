# Cloudflare catalog site delivery

Related issue: [#62](https://github.com/i-9-ai/skills/issues/62).

## Objective and authority

Extend the reviewable catalog website with native Cloudflare Pages Git previews
and production delivery from `main`. The maintainer explicitly authorized both
on September 30, 2026. This supersedes the hosting exclusion in the original
website plan; it does not authorize merging website PR #67 before its human
review, modifying DNS, or migrating existing GitHub Pages visual guides.

## Scope and configuration

- Keep the current repository as the Git source, with no copied skill tree,
  custom upload workflow, deploy script or repository token.
- Use the existing Cloudflare GitHub installation, native PR comments and
  Cloudflare build checks. Production branch is `main`; the initial preview
  branch is `codex/catalog-promotion-site`.
- Build with `npm run site:build`, Node `24.21.0`, dependency installation skipped
  because the website uses only Node built-ins, and output
  `.work/website-preview`. The main checkout does not contain the website until
  PR #67 merges, so do not request a production build of the current main tree.
- Preview builds remain `noindex`, with disallowing robots and no canonical
  production metadata. Configure `I9_SITE_PUBLIC_URL` only for the production
  environment, using the project's verified HTTPS Pages origin. Local builds
  remain review artifacts unless an operator explicitly selects a public URL.
- Production builds emit canonical locale URLs, absolute language alternates,
  public share metadata, an allowing robots file and a sitemap of canonical
  locales. Building remains distinct from deployment.
- Preserve GitHub Pages guide URLs and Wiki/registry release workflows.
- Simplify documented portable installation to
  `npx skills add i-9-ai/skills --yes`; the installer selects all skills with
  `--yes`. Global installation adds `--global` and does not change that selection.
- On unprefixed `/` and `/index.html`, offer a dismissible suggestion in the
  first supported browser language when it differs from English. Preserve
  query/fragment state; explicit `/en/`, `/pt-br/` and `/es/` routes suppress it.
  Never redirect automatically or persist browser preferences.

## Acceptance and evidence

The instruction hierarchy is retained: repository authority stays in root
`AGENTS.md`, website ownership in `website/AGENTS.md`, implementation records in
`plans/AGENTS.md`, and disposable verification in `tests/AGENTS.md`. Only the plan
index gains this linked scope; no provider, asset or locale child contract is
created. Read root then the applicable existing child. Build details remain in
the same-basename `website/scripts/build.md`; restore its guide and the plan index
together when reverting this delivery.

1. Production URL validation rejects credentials, queries, fragments, non-HTTPS
   URLs and non-root paths before creating output.
2. Synthetic builds distinguish review and production metadata, preserve
   deterministic ownership and reject source/output overlap, including missing
   or empty reserved directories.
3. Root language suggestions never redirect, preserve query/fragment state and
   do not appear on explicit locale URLs. Browser coverage and unsupported
   emulation are reported separately from helper/render tests.
4. Repository checks, package verification and independent review apply to the
   final commit. Resolve the main merge conflict and make PR #67 ready only
   after pertinent findings and checks pass.
5. Read back the provider's Git source, branches, environments, build settings
   and PR-comment setting. Identify any preview deployment by exact commit and
   inspect its HTTPS URL. A configured project is not a successful deployment.
6. Production starts from the approved website merge into main. Keep the site
   PR open for that review; never label the current unrelated main as deployed.

## Rollback and removal

Disable preview/production build controls to stop automatic delivery. Retain or
roll back to a previously verified Pages deployment; remove the project only
after separate deletion authorization. Source rollback reverts these build and
documentation additions. No DNS, secrets, installed skills or global agent
configuration need recovery.
