# Validation

Every new or changed skill must pass the official `skills-ref validate` command identified by the [Agent Skills specification](https://agentskills.io/specification#validation). The local helper supplements this with licenses, references, public hygiene, optional metadata, adapter checks, and artifact integrity. Neither structural layer replaces behavioral evaluation.

## Local checks

Use Node.js 22+. Repository checks, the standalone creator helper, and all regression tests use built-in modules. No npm dependency installation, Python, network access, or credential is needed locally. Commands and the external CI tool's pins are centralized in [package.json](../package.json).

From the repository root:

```sh
npm run check
git diff --check
```

`npm run validate` checks the collection, and `npm test` runs only disposable local tests. The code lives in [src/](../src/AGENTS.md): pure domain policy, application use cases, filesystem/process adapters, and a small CLI. The creator's standalone helper stays inside its own distributable package and is reused by a repository adapter.

Run against an owned checkout that remains stable throughout validation. Unsafe entries and detected changes are rejected; these checks are not a sandbox against concurrent adversarial mutation. Do not run candidate scripts or allow other writers to mutate the selected package while checking it.

## Official validation in the workflow

Python is supplied only by the GitHub workflow because the official upstream tool is implemented in Python. CI sets up Python 3.12, creates ignored `.work/validation-env`, and runs `npm run ci:official`. This Node use case checks the collection, installs the pinned external tool in that isolated environment, verifies its version, and invokes `skills-ref validate` for every canonical package. Local contributors do not prepare a Python environment.

Accept official evidence only for the exact PR head and package bytes. A standalone skill can return a handoff to a trusted workflow or another authorized environment with the official tool; it need not force Python into the user's local environment. If no matching official result exists, preserve the package but leave official validation pending and readiness blocked. Custom-parser or manual passes do not substitute.

## Official source pin

The validator is built from [agentskills/agentskills at `69ef37e9424c0a7ea9dd2293b559e43ec8176379`](https://github.com/agentskills/agentskills/tree/69ef37e9424c0a7ea9dd2293b559e43ec8176379/skills-ref), whose package declares version `0.1.0` and Python `>=3.11`. The exact source archive has SHA-256 `0c9eabbe602095c4f4d771ee55bf74f6bc7e1c770f25d4fe29ce9802981daa20`. Its Apache-2.0 license and source stay in the isolated tool installation; the validator is not vendored into a skill.

`package.json` records the official archive, version, and full runtime/build dependency hashes under `config.officialSkillValidator`. [Pure policy](../src/domain/official-validator-policy.mjs) checks immutable source identity, exact versions, unique dependency names, and hashes. The [process adapter](../src/infrastructure/official-validator-process.mjs) derives two temporary installation inputs and removes them afterward. It verifies an isolated Python 3.11+ environment, installs only hashed wheels, then builds the official source with dependency resolution and build isolation disabled. A failure stops later phases. No committed requirements file or duplicate version declaration is maintained in the implementation. This configuration is separate from the benchmark source lock.

The similarly named PyPI `skills-ref` distribution did not match the official source/executable identity during inspection, so this setup uses the official repository archive. A source pin and hashes establish identity, not a complete security certification. Update pins only after reviewing the source and repeating the checks.

## Pull request coverage

The [GitHub workflow](../.github/workflows/validate.yml) runs on every pull request and every push to `main`, without a path filter. It validates the exact PR head checkout and **every canonical package**, which includes all added or modified skills and catches cross-package regressions. The catalog check rejects an omitted or unexpected package. Aliases are not discovered as duplicates, and private scratch is not part of the publication corpus.

The Node process adapter passes package paths as argument arrays to the environment's exact `skills-ref` executable, never through a shell. It applies a per-package execution bound, reports all results, and fails if the tool is missing, its version is wrong, or any package fails. It coordinates the actual official validator rather than reimplementing it. The stricter repository check runs first on the same stable checkout.

CI uses pinned actions, a read-only token, no persisted checkout credentials, no secrets, and a job timeout. It checks whitespace across the actual base/head diff. GitHub branch protection is not changed by this PR; maintainers can separately make the workflow required.
