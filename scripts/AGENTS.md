# Repository tooling

## Purpose
Check collection structure, official conformance, and recorded integrity without provider dependencies. Keep explicit dependency installation separate from offline checks.

## Ownership
Maintainers own validation rules. The current user request governs changes.

## Local contracts
Use Node.js 22+ and built-in modules for new coordinators. The custom filesystem validator uses Python 3.10+ and the standard library for its documented POSIX safety primitives. Official `skills-ref` requires Python 3.11+; the full workflow uses Python 3.12. Keep all Python dependency versions and hashes in the root `requirements.txt`.

Read only within the explicitly selected root, bound resource usage, reject unexpected symlinks and special files, and avoid printing possible credentials. Do not turn a structural check into a claim of behavioral or legal approval. Installation may contact only the declared dependency sources within task authority and must use an isolated environment; validation makes no network requests.

## Work guidance
Keep package-level operations in the creator's standalone helper. Keep collection checks here. Make rules observable with synthetic fixtures and document their limits.

## Verification
Follow [validation setup](../docs/validation.md), then run the repository and official validators plus the Python and Node regression suites from the repository root. Missing official execution is a failure, never a silent skip.

## Child DOX index
- [Repository validator](validate_repository.py): catalog, package, link, source-lock, example-run, and hygiene checks.
- [Official validator runner](validate_skills.mjs): bounded shell-free execution over every canonical skill.
- [Validation installer](install_validation.mjs): staged installation derived from the single requirements declaration.
