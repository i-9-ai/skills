# Validation

Every new or changed skill must pass the official `skills-ref validate` command identified by the [Agent Skills specification](https://agentskills.io/specification#validation). The local helper supplements this with licenses, references, public hygiene, model metadata, adapter checks, and artifact integrity. Neither structural layer replaces behavioral evaluation.

## Reproducible local setup

Use Python 3.11+ for the official tool and Node.js 22+ for the collection runner. The custom POSIX helper requires Python 3.10+; Python 3.12 satisfies both and is used in CI. Verify existing runtimes before installing anything. Installation below is confined to ignored `.work/validation-env`; no global skill or runtime configuration is changed.

From the repository root:

```sh
python3 -m venv .work/validation-env
node scripts/install_validation.mjs
python3 scripts/validate_repository.py
PATH="$PWD/.work/validation-env/bin:$PATH" node scripts/validate_skills.mjs
python3 -m unittest discover -s tests -v
node --test tests/test_validate_skills.mjs
git diff --check
```

To validate a standalone generated package, run the environment's `skills-ref validate` with the selected package directory. In another repository, use an existing trusted installation or reproduce the pinned source setup; do not install a similarly named registry package without verifying its identity. If the official tool cannot run, preserve the authored package but leave official validation pending and readiness blocked. Do not substitute a manual or custom-parser pass for the required official result.

## Official source pin

The validator is built from [agentskills/agentskills at `69ef37e9424c0a7ea9dd2293b559e43ec8176379`](https://github.com/agentskills/agentskills/tree/69ef37e9424c0a7ea9dd2293b559e43ec8176379/skills-ref), whose package declares version `0.1.0` and Python `>=3.11`. The exact source archive has SHA-256 `0c9eabbe602095c4f4d771ee55bf74f6bc7e1c770f25d4fe29ce9802981daa20`. Its Apache-2.0 license and source stay in the isolated tool installation; the validator is not vendored into a skill.

[requirements.txt](../requirements.txt) is the single declaration for repository Python dependencies, including the complete runtime/build dependency closure and the official archive, subdirectory, and hashes. The [Node installer](../scripts/install_validation.mjs) derives two temporary installation phases from that file and removes them afterward. It first verifies an isolated Python 3.11+ environment, then installs only hashed wheels, and finally builds the official source with dependency resolution and build isolation disabled. A failure stops later phases. These steps prevent the build backend from selecting unpinned dependencies; a plain one-pass `pip install -r requirements.txt` does not provide the same controlled build. No versions or hashes are duplicated in the installer. This is separate from the benchmark source lock.

The similarly named PyPI `skills-ref` distribution did not match the official source/executable identity during inspection, so this setup uses the official repository archive. A source pin and hashes establish identity, not a complete security certification. Update pins only after reviewing the source and repeating the checks.

## Pull request coverage

The [GitHub workflow](../.github/workflows/validate.yml) runs on every pull request and every push to `main`, without a path filter. It validates the exact PR head checkout and **every canonical package**, which includes all added or modified skills and catches cross-package regressions. The catalog check rejects an omitted or unexpected package. Aliases are not discovered as duplicates, and private scratch is not part of the publication corpus.

The Node runner passes package paths as argument arrays to `skills-ref`, never through a shell, applies a per-package execution bound, reports all results, and fails if the tool is missing or any package fails. It is a coordinator, not an alternative implementation of the official validator. Run the stricter repository check first on the same stable checkout; the Node runner is not the adversarial filesystem boundary.

CI uses pinned actions, a read-only token, no persisted checkout credentials, no secrets, and a job timeout. It checks whitespace across the actual base/head diff. GitHub branch protection is not changed by this PR; maintainers can separately make the workflow required.
