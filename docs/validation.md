# Validation

Every new or changed skill must pass the official `skills-ref validate` command identified by the [Agent Skills specification](https://agentskills.io/specification#validation). The local helper supplements this with licenses, references, public hygiene, optional metadata, adapter checks, and artifact integrity. Neither structural layer replaces behavioral evaluation.

## Local checks

Use Node.js 24+ and run `npm ci` explicitly for the pinned CLI and type-checking dependencies. Subsequent local checks need no Python, network access or credentials. Standalone skill helpers still use built-in modules. Commands and official tool pins are centralized in [package.json](../package.json).

From the repository root:

```sh
npm run check
git diff --check
```

`npm run check` runs type checking, collection validation and disposable tests. Source lives in [src/](../src/AGENTS.md): singular command, service, repository, validator, migration and transport layers. The creator's standalone helper stays inside its distributable package and is reused by a repository.

Run against an owned checkout that remains stable throughout validation. Unsafe entries and detected changes are rejected; these checks are not a sandbox against concurrent adversarial mutation. Do not run candidate scripts or allow other writers to mutate the selected package while checking it.

## Collection checks and limits

The pinned official validator checks its implemented frontmatter and naming
rules. It does not audit executable behavior, local resource completeness,
icons, source rights, private data, or task performance. The collection's
stricter checks remain required in addition to official conformance; neither
check replaces a recorded behavioral evaluation on the actual candidate.

These checks maintain this source repository. They are not installed with a skill, and their commands must not be inferred in a consumer's project.

`npm run validate` discovers catalog packages, checks local links across repository documents, validates committed example runs named `run.json`, and checks `upstreams.lock.json` if present. Its public hygiene scan recognizes a small set of high-confidence credential, private-key, authenticated-URL, and local-user-path patterns without echoing matched values. It is a basic guard; binary content and less recognizable secrets still need review.

Canonical repository packages live in `.agents/skills/`. Collection validation permits only these exact aliases: `CLAUDE.md` to `AGENTS.md`, `.claude/skills` to `../.agents/skills`, and `.github/skills` to `../.agents/skills`. It verifies their targets, does not traverse them during inventory, and counts the canonical packages once. This collection-only exception never permits symlinks inside a package or run.

Root `.work/`, `tmp/`, `.beads/`, and `.codex/` are local operational state and are never read or traversed by collection validation. When Git metadata is available, a bounded read-only index check rejects tracked scratch without returning its names or contents. Git is required for that check; exported trees cannot establish what the publication index contains. Nested directories with those names remain part of the checked publication corpus. Root Git metadata is excluded. Cache-like names do not create additional exemptions; keep local environments and generated scratch under the designated root scratch directories.

Lock verification is offline. It checks source identity, immutable revisions, safe file paths, known consumers, digest formatting, and the aggregate hash described in [source research](upstream-research.md). It cannot verify that upstream bytes, licensing, ownership, or adoption claims match the recorded source. The lock is an audit input for future evolution, not an installed runtime dependency.

## Detached-package checks

The [distribution regressions](../tests/integration/collection/distribution.test.mjs) copy only package directories into disposable layouts outside this checkout. They exercise the creator helper from an unrelated working directory, using read-only installed resources, separate output/run directories, and installer-style directory aliases. They also validate every package's copied resources without this repository's catalog, root instructions, `src/`, or package configuration. No consumer home or actual installation is modified.

This is a reproducible package-relocation check, not an invocation of `npx skills` or proof of model behavior in every host. Official validation remains required separately.

## Official validation in the workflow

Python is supplied only by the GitHub workflow because the official upstream tool is implemented in Python. CI sets up Python 3.12, creates ignored `.work/validation-env`, and runs `npm run ci:official`. This Node use case checks the collection, installs the pinned external tool in that isolated environment, verifies its version, and invokes `skills-ref validate` for every canonical package. Local contributors do not prepare a Python environment.

Accept official evidence only for the exact PR head and package bytes. A standalone skill can return a handoff to a trusted workflow or another authorized environment with the official tool; it need not force Python into the user's local environment. If no matching official result exists, preserve the package but leave official validation pending and readiness blocked. Custom-parser or manual passes do not substitute.

## Official source pin

The validator is built from [agentskills/agentskills at `69ef37e9424c0a7ea9dd2293b559e43ec8176379`](https://github.com/agentskills/agentskills/tree/69ef37e9424c0a7ea9dd2293b559e43ec8176379/skills-ref), whose package declares version `0.1.0` and Python `>=3.11`. The exact source archive has SHA-256 `0c9eabbe602095c4f4d771ee55bf74f6bc7e1c770f25d4fe29ce9802981daa20`. Its Apache-2.0 license and source stay in the isolated tool installation; the validator is not vendored into a skill.

`package.json` records the official archive, version, and full runtime/build dependency hashes under `config.officialSkillValidator`. [Pure policy](../src/validator/OfficialValidator.ts) checks immutable source identity, exact versions, unique dependency names, and hashes. The [process adapter](../src/repository/OfficialValidatorProcessRepository.ts) derives two temporary installation inputs and removes them afterward. It verifies an isolated Python 3.11+ environment, installs only hashed wheels, then builds the official source with dependency resolution and build isolation disabled. A failure stops later phases. No committed requirements file or duplicate version declaration is maintained in the implementation. This configuration is separate from the benchmark source lock.

The similarly named PyPI `skills-ref` distribution did not match the official source/executable identity during inspection, so this setup uses the official repository archive. A source pin and hashes establish identity, not a complete security certification. Update pins only after reviewing the source and repeating the checks.

## Pull request coverage

The [GitHub workflow](../.github/workflows/validate.yml) runs on every pull request and every push to `main`, without a path filter. It validates the exact PR head checkout and **every canonical package**, which includes all added or modified skills and catches cross-package regressions. The catalog check rejects an omitted or unexpected package. Aliases are not discovered as duplicates, and private scratch is not part of the publication corpus.

The Node process adapter passes package paths as argument arrays to the environment's exact `skills-ref` executable, never through a shell. It applies a per-package execution bound, reports all results, and fails if the tool is missing, its version is wrong, or any package fails. It coordinates the actual official validator rather than reimplementing it. The stricter repository check runs first on the same stable checkout.

CI uses pinned actions, a read-only token, no persisted checkout credentials, no secrets, and a job timeout. It checks whitespace across the actual base/head diff. GitHub branch protection is not changed by this PR; maintainers can separately make the workflow required.
