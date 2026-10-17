# Release management

Changesets owns release planning, changelog generation and version PRs. The
supported release path is automated: contribute a Changeset, merge the change,
then review and merge the generated version PR. Manual release preparation and
manual changes to generated version artifacts are outside this workflow.

## Contributions

Add a concrete release note and semantic version intent for user-visible changes:

```sh
npm run changeset
npm run changeset:status
```

The note must cover the delivered interfaces, capabilities and meaningful limits.
Use the usual protected PR process. Do not edit pending content into `CHANGELOG.md`.

## Automatic versioning and publication

The [release workflow](https://github.com/i-9-ai/skills/blob/main/.github/workflows/release.yml)
runs on pushes to `main`. Official Changesets actions select versioning,
publication or no work. They are pinned to `v2.1.2`; the CLI is pinned to `3.0.2`.

1. Pending Changesets create or update a draft version PR.
2. `npm run version:packages` runs `changeset version`, refreshes the npm lockfile
   without lifecycle scripts, and synchronizes the Codex, Claude and Copilot
   plugin manifests with the package version.
3. Review the generated PR and mark it ready to run the protected checks.
4. Merging the version PR runs repository and packed-runtime checks, then the
   official pack action hands its artifact to the official publish action.
5. npm Trusted Publishing uploads the artifact; Changesets creates its Git tag
   and GitHub release. An independent read-only job checks public availability
   and tarball integrity for the exact published version.

The [Changesets validation workflow](https://github.com/i-9-ai/skills/blob/main/.github/workflows/changesets.yml)
uses ordinary `changeset status` against `origin/main` for contributions and
rehearses versioning when the official selector returns `version`. The generated
`changeset-release/main` PR skips the pending-note requirement because versioning
has consumed its notes. No custom generated-diff verifier,
reference receipt, replay engine or historical backfill is retained.

The pinned `@changesets/changelog-github` generator supplies PR, commit and author
references using the action's GitHub token. Previous changelog entries remain
under Changesets control. Repository checks remain offline; only hosted
versioning resolves GitHub references. Release runs are serialized.

## Required repository and npm settings

Enable **Allow GitHub Actions to create and approve pull requests** in repository
Actions settings. Version PRs still follow the repository's protected merge
process. If GitHub requires approval to run a generated PR's workflows, approve
those runs and wait for checks on the current head.

Keep the npm Trusted Publishing binding for `@i-9.ai/skills` at owner `i-9-ai`,
repository `skills`, workflow **`release.yml`**, with no environment. This workflow
filename is preserved to avoid changing the configured identity. Only the publish
job has `id-token: write`; no stored npm token is needed. Node 24 supplies the
supported npm runtime. See [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/).

The availability job verifies retrieval and integrity, not installed CLI or MCP
behavior. A failed availability check can follow a successful upload; inspect the
registry before retrying. Published versions cannot be overwritten: corrections
use a new Changeset. See the
[availability guide](https://github.com/i-9-ai/skills/blob/main/.github/scripts/package-availability.md).

## Development validation

```sh
npm ci
npm run check
npm run package:check
npm run changeset:status
git diff --check
```

Versioning runs only in automation or a disposable rehearsal checkout. The
consumer CLI no longer provides `repo prepare-version` or `repo verify-release`;
the npm aliases `release:prepare` and `release:verify` are removed. Local checks
and rehearsals do not publish, merge, install or prove a hosted release.
