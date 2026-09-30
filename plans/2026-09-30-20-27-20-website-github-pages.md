# Publish the catalog website on GitHub Pages

## Objective and authority

The user explicitly requests the new website on GitHub Pages before closing the
release. Replace the visual-guide-only publication workflow; retain existing
guide filenames. Release publication remains paused during this migration.

## Scope and implementation

Use the official Pages artifact/deployment actions with immutable revisions,
Node 24 and separate read-only build and scoped deployment jobs. Publish only
merged main or a manual dispatch on main. Build the catalog at the configured
Pages base URL, supporting the project path `/skills/`, then copy verified public
visual guides into the same artifact. Never include AGENTS.md or repository state.
Change the repository Pages source from its legacy branch to Actions after the
workflow is merged. Cloudflare previews remain independent.

## Validation and rollback

Exercise project-path canonical URLs, assets, locale suggestions and sitemap in
isolated tests; run npm ci, npm run check, Changesets status and diff checks.
Obtain independent review of the exact commit. After authorized merge, verify
the workflow and anonymous root, locale and existing guide URLs before release.
Rollback restores the former workflow and Pages branch setting; preserve the
existing gh-pages branch rather than deleting its content.
