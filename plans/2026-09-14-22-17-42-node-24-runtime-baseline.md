# Node.js 24 runtime baseline

## Objective

Make Node.js 24 the minimum supported runtime for repository-owned tooling and
the three distributed helpers that declare a Node runtime. Contributors and CI
should execute the same documented baseline without relying on an older LTS
line.

## Scope

- Raise the root `engines.node` contract and the repository CLI guard to Node.js
  24 or newer.
- Run the validation and Changesets workflows on Node.js 24.
- Align documentation, package frontmatter, helper guards, examples, tests, and
  the root lockfile's package metadata with that baseline.
- Preserve zero-dependency JavaScript execution; this plan does not introduce
  TypeScript, a compiler, a runtime loader, or a command framework.

## Exclusions

- No migration of repository tooling to TypeScript.
- No new dependency, package-manager setup, release, publication, consumer
  installation, host configuration, or change to local global skills.
- No claim that all Node.js 24 releases supply a particular future Node feature
  beyond the built-ins already used by these utilities.

## Authority boundaries

This change is limited to the repository's runtime contract and its canonical
skill packages. It does not authorize a release, merge, publication, or any
mutation outside this checkout. Consumers remain responsible for choosing a
supported Node.js 24-or-newer runtime before running an optional helper.

## Implementation sequence

1. Inventory every owned Node.js 22 declaration and distinguish a runtime
   requirement from historical evidence.
2. Raise active runtime requirements to Node.js 24 or newer in the root,
   workflows, command guard, distributed helpers, package contracts, examples,
   tests, and public documentation.
3. Keep historical observations intact while adding a note where a prior plan
   captured the former Node.js 22 baseline.
4. Regenerate derived catalog data only if a changed package summary requires
   it, then inspect its diff.
5. Run repository checks, Changesets status, whitespace checks, and the pinned
   official validator for the exact branch head.

## Acceptance criteria

- `package.json`, `package-lock.json`, CLI diagnostics, workflows, and current
  contributor documentation agree on Node.js 24 or newer.
- Every distributed helper that previously enforced Node.js 22 now enforces
  Node.js 24, and its package prose says the same.
- Tests use the declared baseline in generated fixtures where that runtime is
  part of the fixture contract.
- Historical evidence is not rewritten to imply it was executed on Node.js 24.
- The repository and official validator pass at the resulting commit, or a
  concrete execution limitation is recorded.

## Validation and retained evidence

Run `npm run check`, `npm run changeset:status`, `git diff --check`, and
`npm run ci:official`. CI must repeat the owned checks and official validation
on the exact pull-request head. Retain the exact runtime version used locally,
the workflow configuration, and the resulting outputs in the pull request.

## Rollback

Revert this focused commit set to restore the Node.js 22 contract in source,
documentation, workflows, lock metadata, and distributed helper diagnostics.
No generated runtime output, consumer configuration, or dependency state needs
cleanup.
