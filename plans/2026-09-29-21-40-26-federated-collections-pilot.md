---
title: "Synthetic federated collections consumer pilot"
issue: "https://github.com/i-9-ai/skills/issues/4"
---

# Synthetic federated collections consumer pilot

## Objective

Consolidate reproducible evidence that a caller can discover and qualify skills from two independently owned collections, carry one bounded artifact handoff across their boundary, and stop when identity, authority or a required capability is missing. Reuse the existing portable contracts and implement only a demonstrated gap.

This is an independently reviewable consumer verification boundary. It does not replace the earlier catalog-index, authoring or native-host plans.

## Frozen scope and acceptance

| Case | Observable result | Evidence |
| --- | --- | --- |
| Two independently owned synthetic collections | Separate fixture roots and fictional owners; only explicitly selected schema-1 catalogs enter the index | Existing catalog and aggregate helpers; source snapshots and catalog digests |
| Name collision | Two source-qualified `skill-review` records survive discovery; the authored route selects the intended source and rejects the near-miss boundary | Exact-name query, inspected SKILL.md bytes, bounded decision fixture |
| Package qualification | Source, relative package path, metadata, license bytes and frozen content digest agree before handoff | Existing catalog checks and confined file reads plus test assertions |
| Bounded cross-collection sequence | Two distinct selected capabilities produce and consume one versioned, hashed plan artifact; only the declared review artifact follows | Frozen route and test-only handoff verification, maximum two stages and 4 KiB per artifact |
| Missing optional companion | Text-only plan remains valid; no lookup expansion, fetch or installation occurs | Explicit optional dependency and fallback in the fixture |
| Missing required capability | A scoped empty catalog query yields `none`; a previously selected dependent route is `blocked` and retains its verified input | Missing-capability and missing-selected-package cases |
| Changed evidence or expanded authority | Changed package/artifact bytes, an extra stage, an incompatible artifact version, oversized input or an unauthorized effect stops the handoff | Negative deterministic fixtures |
| Effects | Source packages/catalogs are byte-identical after the run; writes are confined to disposable caller-owned index/evidence outputs | Before/after snapshots and output inventory |

The authored route is an explicit fixture input. Tests verify the route's concrete identities, declared constraints and artifact integrity; they do not select a route semantically or execute a model. The local handoff record is an illustrative consumer artifact, not a new universal runtime or machine API.

## Existing contracts used

- Catalog schema version 1 supplies `name`, `path`, `description` and normalized `tags`; it carries neither lifecycle state nor execution authority.
- `skills-catalog-index` preserves explicit source IDs and catalog byte digests, keeps same-name packages separate, and writes only to an approved output outside source collections.
- `skill-routing` requires inspection of package boundaries, verified identity, separate setup-readiness evidence, at most three final candidates and an explicit `none` or ambiguous result where appropriate.
- The portable companion/handoff guidance distinguishes installed resources from caller outputs, requires explicit companion availability and identity, preserves artifact hashes, and blocks dependent work after a changed or missing input.
- Collection versioning and package content identity remain separate from the catalog schema. This synthetic fixture uses computed content digests and explicitly unavailable Git provenance; it does not fabricate source commits or authentication of fictional owners.

## Authority and exclusions

Only new documentation, synthetic fixtures/tests, this plan and a Changeset are in scope. Use temporary fixture directories and the already available Node.js 24 dependencies. No real consumer, global collection, installed package, host link, domain repository, network request, setup command, publication, release, Git mutation or third-party communication is part of the pilot.

Do not alter existing skill packages, shared services, documentation indexes, root instructions or packaging tests. Report a demonstrated contract gap to the integration owner before changing that scope. Existing independently scoped work remains untouched.

## Implementation sequence

1. Freeze this matrix and inspect the actual catalog, routing and companion contracts.
2. Add small original fixture packages for a plan producer, an independent plan reviewer and a same-name near miss. Keep fictional ownership and caller authority explicit.
3. Build the selected catalogs/index through existing helpers. Verify source-qualified identities and read package instructions before accepting the authored route.
4. Exercise a two-stage artifact handoff and explicit refusal cases through test-only assertions and fixed data. Retain enough checked-in fixture data for a reviewer to reproduce every conclusion.
5. Document the public interoperability contract, runnable test command, actual passing cases and limitations. Add a concrete patch Changeset.
6. Freeze the owned files for integration and independent review on the resulting commit.

## Validation and retained evidence

Run the new `federated-*.test.mjs` suite and affected existing catalog/index distribution suites with Node.js 24. Run Changesets status and `git diff --check`. Tests must use disposable fixtures, make no network calls, leave the checkout unchanged and never read a real home collection. The integration owner runs the complete repository and official validation gates.

Report deterministic fixture execution separately from semantic routing, model evaluation, native-host execution and real independently maintained consumer adoption. None of the latter is established by this pilot. Preserve the exact test names, counts, command and known limitations in the delivery report.

## Rollback

Remove the new pilot documentation, fixtures/tests and matching Changeset in one revert. Temporary outputs are removed by each test. No production command, catalog, package, installed host or external state needs rollback.
