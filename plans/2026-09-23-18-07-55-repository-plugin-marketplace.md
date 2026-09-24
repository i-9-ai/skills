# Repository plugin marketplace preparation

Issue: `i9-skills-alv`.

## Objective

Make the repository itself the plugin in PR #2. Its host manifests must reference the one canonical collection at `.agents/skills`, and its marketplace entry must resolve to the repository root. A separately generated artifact remains an optional, untracked staging format.

## Scope and authority

- Add host manifests at the repository root where a host supports a custom skill path, without copying packages or relying on repository symlinks.
- Point `.agents/plugins/marketplace.json` at the repository root.
- Add a structural check that each declared host skill path resolves to `.agents/skills` and update documentation/tests to state host-specific limits.
- Keep the separate `github-wiki` skill in the user's global collection. Verify Wiki availability in the workflow and reuse its existing Node repository class for a testable mirror that excludes `AGENTS.md`.
- Do not install the plugin, import the marketplace, publish a release, change visibility, enable the Wiki, merge, or alter a consumer's host configuration.

## Implementation and validation

1. Remove the checked-in generated plugin and add root Codex, Claude Code and Copilot manifests that point to the canonical package directory.
2. Add the marketplace entry and a regression check for the root source, manifest paths, and absence of a checked-in duplicate collection.
3. Document how to import the repository marketplace after merge, while distinguishing structural validation from actual host ingestion and future public availability.
4. Run host validators where applicable, official skill validators for changed skills, `npm ci`, `npm run check`, `npm run package:check`, Changeset status and `git diff --check`. The bundled plugin-creator validator's fixed `skills/` rule cannot certify the intentional `.agents/skills` root layout; record that limit and obtain a Codex consumer ingestion check before claiming native installation.
5. Obtain independent review on the exact commit, address findings, and push the tested commit to PR #2.

The prior checked-in artifact is removed. Removing a host manifest or marketplace entry disables that integration without touching canonical packages; an installed consumer plugin requires separate removal in that consumer. Keep the CLI `plugin prepare` only for explicit disposable staging, never as a second tracked skill tree.
