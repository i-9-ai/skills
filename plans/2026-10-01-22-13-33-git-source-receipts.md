# Git source receipts for compiled artifacts

Related: [Issue #55](https://github.com/i-9-ai/skills/issues/55).

## Objective

Retain the exact clean Git revision observed during preparation of this package,
then expose the same bounded provenance through installed catalog CLI and MCP
responses without looking at a consumer's Git repository.

## Scope and integrity boundary

The existing build compiles a repository-owned TypeScript receipt runner after
type checking. The runner selects its own package root and writes only
`dist/source-receipt.json`. Schema 1 contains fixed package/repository identities,
the package version, either an exact 40-character Git SHA verified against a clean
owned checkout or an explicit unavailable reason, and a sorted SHA-256 inventory
of distributed files. Allowlisted resources are the package manifest, catalog,
launcher/operator guide, README/license/notices, compiled JavaScript, bundled
skill packages and public documentation. The receipt excludes itself, Git
configuration, remotes, user paths, prompts, timestamps, environment data and
unrelated repository files.

The receipt is an unsigned build assertion. Hashes detect missing or modified
resources against that assertion; they do not authenticate an artifact publisher
or prove a Git revision after Git metadata is removed. Installed responses label
the source `asserted`, preserve `build_verification: verified` separately, and
label file-integrity verification `verified`. Missing, invalid, oversized or
modified receipts/resources expose unavailable source fields. A source archive,
dirty checkout, unknown repository identity or unavailable Git executable never
acquires a guessed SHA. A build may overwrite an earlier receipt with unavailable
evidence; it must not retain stale source claims.

Bounds are 1 MiB per receipt, 4 MiB per file, 4096 inventory files, 24 directory
levels and 32 MiB total content. Paths are relative, confined, allowlisted and
sorted. Duplicate fields and unrecognized properties are rejected, as are
symbolic links, hard links and special files.
Git is invoked only at build time with no network, prompts, global configuration,
hooks or replacement objects. Ownership requires a `.git` entry at the selected
package root and Git's top-level root to match. Runtime catalog/MCP reads never
run Git, execute candidate scripts or write state.

## Sequence and authority

1. Add the closed receipt schema, confined build/read repository and runner.
2. Append receipt generation to the existing build and package-file allowlist.
3. Compose source evidence in the installed catalog repository, shared by CLI/MCP.
4. Add disposable clean-Git/archive/tampering fixtures and packaging assertions.
5. Validate formatting, types, focused tests and Changeset intent; obtain review
   on the final commit through the parent delivery workflow.

This adds no dependency or CLI route. It does not install consumers, change host
configuration, publish, tag, release, merge, or contact external parties. Rollback
removes the runner/build integration and provenance fields; existing catalog
content checks and missing-source behavior remain available. No migration or
persistent user data is involved.

## Acceptance and retained evidence

- A clean synthetic official-origin Git checkout records its exact selected SHA.
- An archive nested under an unrelated Git root reports unavailable source.
- Dirty source, an unknown origin and Git metadata absence never fabricate SHA.
- Compiled installed artifacts without `.git` retain the source assertion and
  verified content inventory; CLI/MCP use the same repository result.
- Missing, stale, modified, linked, excessive or closed-schema-invalid evidence
  reports a bounded gap without exposing paths or source content.
- Repeated catalog reads preserve every fixture byte and never invoke Git.
- Focused tests run with Node.js 24 after explicit `npm ci`; complete validation
  includes `npm run check`, `npm run package:check`, `npm run changeset:status`
  and `git diff --check` on the final combined change.
