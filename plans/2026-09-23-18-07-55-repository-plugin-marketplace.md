# Repository plugin marketplace preparation

Issue: `i9-skills-alv`.

## Objective

Make the reviewed meta-skill collection in PR #2 installable as a Codex plugin after merge, with a repository marketplace entry that can later be imported from a public repository. Keep the source packages canonical in `.agents/skills` and generate a complete, reviewable plugin artifact from them.

## Scope and authority

- Add `plugins/i9-skills` as the release candidate produced by the existing deterministic `plugin prepare` command.
- Add `.agents/plugins/marketplace.json` with a local relative source path to that artifact.
- Add a drift check against the canonical packages and update documentation/tests so reviewers can verify freshness and installation prerequisites.
- Keep the separate `github-wiki` skill in the user's global collection. Finish the repository Wiki workflow guard that excludes `AGENTS.md`.
- Do not install the plugin, import the marketplace, publish a release, change visibility, enable the Wiki, merge, or alter a consumer's host configuration.

## Implementation and validation

1. Generate the plugin artifact from the current catalog into the repository and inspect its manifest, files and receipt.
2. Add the marketplace entry and a regression check that regenerates the artifact in a disposable directory and compares all files byte for byte. A source change then makes the review check fail until the artifact is refreshed.
3. Document how to import the repository marketplace after merge, while distinguishing local validation from actual Codex ingestion and future public availability.
4. Run the plugin-creator validator, official skill validators where applicable, `npm ci`, `npm run check`, `npm run package:check`, Changeset status and `git diff --check`. Verify the global skill separately.
5. Obtain independent review on the exact commit, address findings, and push the tested commit to PR #2.

The generated directory can be removed without touching canonical packages or the CLI. Removing its marketplace entry disables future discovery; an installed consumer plugin requires separate removal in that consumer. Keep the CLI `plugin prepare` as a deterministic way to refresh the artifact rather than hand-editing copied packages.
