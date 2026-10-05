---
title: 'GitHub module roadmap and reproducible consumer fixture'
issue: 'https://github.com/i-9-ai/skills/issues/16'
---

# GitHub module roadmap and reproducible consumer fixture

## Objective

Make the proposed GitHub family under issues #16 and #5 concrete and publicly
reproducible: retain separate issue and Wiki responsibilities, propose an owner
and independent release boundary, and exercise an original standalone consumer
fixture through the existing catalog helpers. Readers must not need private
source captures or an installed global skill to reproduce the integration proof.

## Scope and authority

Add one test and its synthetic scenario under `tests/integration/collection`,
extend `docs/Collection Modules.md`, add this plan and a patch Changeset, and
update the existing test/plan indexes. No package, catalog, runtime, CLI,
dependency, workflow, native host, GitHub client or external system changes.
No domain procedure or real global package corpus is copied into this repository.

I9AI maintainers are a proposed module owner; named acceptance is not recorded
by this work. Source admission, actual package evaluation, external repository
creation, consumer installation and publication require their own review and
authorization. Local reference hashes never stand in for a missing upstream
revision or publisher authentication.

## Existing boundaries and implementation

The root contract continues to own meta-skill-only scope. `tests/AGENTS.md` owns
temporary synthetic fixtures; `plans/AGENTS.md` owns this durable recipe; the
existing public-documentation contract owns the module roadmap. Add a concise
link to the new test and plan in those existing indexes. Create no child scope.

1. Preserve the source-to-capability decisions from inspected local
   `github-issues` and `github-wiki` references as sanitized rationale, not copied
   executable packages. Keep complete-license observations and unknown installed
   upstream revisions explicit.
2. Use original fake issue records, documentation and two minimal fixture
   packages. Import the existing repository catalog/index helpers and `SafeRoot`
   directly. Do not vendor helpers or introduce a generalized fixture framework.
3. Exercise the fixed source-qualified issue-observation → Wiki-preview sequence
   in a disposable consumer. Proposed artifact versions belong to this fixture;
   they are not interfaces verified in the local domain packages.
4. Add only domain-relevant cases: explicitly queried complete open/closed issue
   evidence, bounded nonempty duplicate keys and repository identity; literal
   body text; complete rederived handoff facts even after digest replacement;
   Wiki availability and initialization;
   merged documentation, concurrent input drift, agent-instruction exclusions,
   traversal rejection and separately unauthorized publication/deletion.
5. Reuse the existing federated consumer suite for its catalog-version,
   collision, complete-package/resource identity, incompatible artifact and
   generic authority cases. Do not duplicate those negative-test matrices.
6. Document the exact public test command, proposed owner/release boundary and
   remaining owner decisions; record concrete capabilities and limits in the
   Changeset. Obtain independent review on the eventual adoption commit.

## Acceptance and validation

| Requirement                         | Observable proof                                                                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Publicly reproducible case          | Checked-in original fixture and Node.js 24 test; no home, credential, network, provider or installed domain-package access                                                                   |
| Existing meta-framework integration | Real catalog generation/freshness, source-qualified aggregate query, complete package/license identity and fixed capability check                                                            |
| Concrete local output               | Issue #13 observation includes closed duplicate candidate #9; Wiki preview changes only local output files, excludes root/nested agent instructions and marks proposed deletions unapplied   |
| Domain-specific refusal             | Incomplete issue data, wrong repository, unavailable/uninitialized Wiki, unmerged or changed docs, unsafe path or requested external effect preserves producer evidence and protected inputs |
| No duplicate framework              | Existing federated tests remain unchanged; new helpers are private to one fixed authored scenario                                                                                            |
| Honest roadmap                      | Named ownership, real source admission, actual package/native evaluation and release remain pending; no actual GitHub operation inferred                                                     |

Run with Node.js 24:

```sh
node --test tests/integration/collection/github-family-consumer.test.mjs tests/integration/collection/federated-consumer.test.mjs
npm run changeset:status
npm run validate
git diff --check
```

Retain exact source/fixture hashes, test names/counts, check outputs and the
sanitized patch for review. The integration owner runs the complete repository
checks and exact-commit review after adoption. No real skill package changes,
so this test does not claim new official validation of domain packages. A passing
fixture is deterministic integration evidence, not model or native evaluation.

## Rollback

Remove the new test/scenario, documentation section, Changeset and plan/index
links together. Each test removes its owned temporary consumer. No package,
catalog, runtime, installed consumer, user configuration or external state needs
rollback.
