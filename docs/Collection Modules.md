# Collection module admission and interoperability

A module is an independently owned skill collection selected by the caller.
It has its own packages, catalog, license evidence and release lifecycle. This
repository owns the interoperability contract and meta-skill tooling; it does
not absorb a module's domain procedures or create its repository automatically.

## Required admission evidence

Admission is a review decision made before trusting a discovered package. The
current aggregate index reads catalogs; it is not an admission registry or a
publisher authentication service. Keep the caller's reviewed admission record
separate from the closed catalog schema.

| Required evidence | Meaning and verification |
| --- | --- |
| Selected source ID | Caller-owned unique lowercase slug for this selected collection. It qualifies package names and is not proof of ownership. |
| Owner and source locator | Identified independent maintainer and reviewed repository or artifact origin. Resolve the actual selected source rather than assuming a similarly named collection is equivalent. |
| Catalog format | `skills-catalog.json`, schema version 1, with the exact fields below and a digest of its observed bytes. Unsupported versions or extra fields stop admission; do not silently upgrade the source. |
| Package identity | Source ID, package name, actual installed path, entrypoint digest and complete package inventory digest. Verify the selected entrypoint's frontmatter against the catalog. |
| Redistribution evidence | Complete package LICENSE, its digest, upstream revision and notices for reused material. An SPDX declaration alone is insufficient evidence of permission to copy. Missing rights block redistribution. |
| Resource boundary | Actual package-owned files in a verified non-linked selected root, no traversal or unrelated workspace resources, with documented optional companion and standalone behavior. |
| Capability contract | Responsibility, primary output, accepted inputs, supported artifact versions, expected effects and explicit exclusions, read from the actual package. |
| Readiness evidence | State separately what was structurally checked, behaviorally exercised, tested in a native host, installed, or approved. Unknown readiness remains unknown. |

A catalog contains `schema_version` and `skills`. Each skill has only `name`,
`path`, `description` and `tags`. It follows the existing
[catalog schema](https://github.com/i-9-ai/skills/blob/main/.agents/skills/skills-catalog/assets/skills-catalog.schema.json):
1–256 sorted unique packages, a description of at most 220 characters, bounded
sorted distinct tags, and supported repository/global package paths matching
the skill name. Do not put owner, license or arbitrary module fields into it.

An immutable source revision is required when qualifying an upstream Git
source. For local synthetic or non-Git material, retain `null` and an explicit
source-provenance gap alongside observed digests; do not invent a commit or
treat a content hash as publisher authentication. Rewritten unsigned digests
cannot establish origin.

Optional information includes publisher website, package versions, tags,
icons, host projections, setup entrypoints, artifact schemas and native-host
evaluation. Optional does not mean executable: installation and discovery never
authorize setup, hooks, migration, network access or publication. If a required
workflow depends on one of these capabilities, its availability becomes a
prerequisite for that workflow.

## Discovery, collisions and selected handoffs

Discover only explicitly selected source catalogs and preserve the pair
`source_id:skill_name`. Equal names in different sources remain separate
candidates. Never prefer the newest version, matching name, shared parent
directory or popular owner as an implicit winner. A name-only collision
requires explicit source selection or returns an ambiguous result.

For example, the synthetic Cedar and Meadow collections both contain
`skill-review`; the fixture selects `cedar:skill-plan` followed by
`meadow:skill-review`. Its reviewed identity pins retain independent owners,
source locators, package/license digests and null Git revisions. The aggregate
retains logical source IDs and catalog digests, not local absolute paths or
verified owner claims.

Before a handoff, recheck the current source/catalog and complete package bytes
against the selected observation. Read the actual capability contract. The
producer's output version must match the consumer's input; permitted effects
must remain inside both the caller's authorization and specialist boundaries.
Retain the producer artifact unchanged when a missing companion, unsupported
format or identity drift blocks the consumer. Report the precise missing
capability instead of installing a replacement or expanding the task.

## Installation and updates

The caller explicitly chooses project or global installation and reviews the
selected source. A module installs independently and must remain usable without
this checkout, its catalog, the I-9 CLI or an enabled plugin. A plain documented
artifact is the fallback when an optional presentation or host adapter is absent.
A required unavailable capability returns unsupported or blocked, not success.

Updates remain the module owner's releases and the consumer's selected update
action. Refresh discovery observations and requalify changed source, entrypoint,
license, resources and artifact versions before using them. Preserve existing
evidence and recoverable prior state. Discovery or an aggregate index refresh
does not download, run setup, mutate the module, rename a colliding package,
update user settings, or grant permission to publish a separate repository.

## Existing proof and this contract's limits

[Issue #24](https://github.com/i-9-ai/skills/issues/24) and
[PR #44](https://github.com/i-9-ai/skills/pull/44) delivered the
[federated collections pilot](https://github.com/i-9-ai/skills/wiki/Federated-Collections-Pilot).
Its real catalog helpers already demonstrate discovery across two independent
synthetic owners, source-qualified collisions, pinned package/license identity,
resource bounds, a compatible artifact handoff, a standalone presentation
fallback, missing capabilities, changed package bytes and incompatible outputs.

This contract adds a common admission checklist and explicitly tests that an
unsupported module catalog version cannot replace an existing aggregate or
produce evidence. Duplicate source IDs also cannot collapse independent owners
into one source. These are synthetic deterministic integration checks, not
semantic routing, model evaluation, real module operation, signature validation
or native-host certification.

There is no automatic admission ledger, module installer, resolver, updater,
package execution engine or new module repository in this delivery. Admission
is the caller's reviewed evidence; the existing helpers validate bounded catalogs
and resources. Future automation would need a separately scoped interface,
authority boundary and tests. Broader module prioritization remains
[issue #16](https://github.com/i-9-ai/skills/issues/16).

Run the synthetic proof without network or user-home state:

```sh
node --test tests/integration/collection/federated-consumer.test.mjs
```

## Proposed GitHub family and reproducible consumer case

For [issue #16](https://github.com/i-9-ai/skills/issues/16) and the related
[GitHub family scope](https://github.com/i-9-ai/skills/issues/5), propose a separate
collection starting with `github-issues` and `github-wiki`. I9AI maintainers are
the proposed owner; this work records no named maintainer's acceptance or public
module release. GitHub CLI/API and Wiki capability changes justify a release
cadence independent of the meta-skill tooling. Issue evidence and Wiki content
remain independently requestable package outputs.

The roadmap uses actual caller-selected local packages as references. Complete
local inventories and licenses were inspected; no domain procedure, template,
script or icon is copied into this repository. These local content identities do
not authenticate a publisher, and neither installed upstream revision is known.

| Observed source | Capability and primary output | Original consumer case and reuse boundary |
| --- | --- | --- |
| `github-issues`, local entrypoint SHA-256 `e363aa0c445f1c5fd4773e5149d473defc08ddca5360a83b2448825c3609027b` | Explicit repository identity, complete open/closed issue evidence, literal issue text, bounded duplicate review and authorized changes with readback | Inspect a complete fake issue snapshot for issue #13 and closed candidate #9. Produce only local evidence. No installed package or GitHub operation is executed. |
| `github-wiki`, local entrypoint SHA-256 `0be7e4b3c66b99c567d819efc9eee35c59edb9d5ed4689a94b82e42d4965dbe6` | Wiki availability and initialization, merged canonical documentation, agent-instruction exclusion and separately authorized mirror publication/deletion | Prepare a local Wiki preview from fake merged docs and the issue observation. Retain the issue draft on a missing prerequisite or changed input; proposed deletions stay unapplied. No workflow is copied. |
| Existing catalog/index contract | Source-qualified discovery, freshness and explicit package/resource identity | Generate a schema-1 catalog for original synthetic packages, query the selected source and recheck exact package/license bytes before the fixed handoff. Discovery grants no ownership or execution authority. |

Both reference packages contain complete MIT licenses. The issue package retains
GitHub, Inc., Nous Research and i-9-ai contributor notices; the Wiki package
retains I-9 AI's notice. Any future source admission must preserve applicable
licenses and attribution and qualify the actual selected source. Historical
license/documentation revisions cannot be relabeled as installed-package commits.

The checked-in
[scenario](https://github.com/i-9-ai/skills/blob/main/tests/integration/collection/github-family-consumer.fixture.json)
and
[test](https://github.com/i-9-ai/skills/blob/main/tests/integration/collection/github-family-consumer.test.mjs)
are complete original fixtures, so reproduction does not depend on access to
those local reference packages. The concrete trigger is: “In this separate
handbook workspace, inspect the supplied issue evidence and prepare a Wiki
preview; keep all results local and unsubmitted.” The two illustrative artifact
formats are fixture proposals, not interfaces verified in the installed domain
packages. Plain JSON is the standalone fallback.

The existing federated suite retains the generic collision, catalog-version,
resource, package-drift and artifact-format checks. The GitHub case adds complete
issue pagination, selected repository identity, literal text, Wiki readiness,
merged documentation, concurrent input changes, root/nested agent-instruction
exclusion, traversal rejection and explicit publication/deletion boundaries.
Run both without network, credentials, a plugin or installed domain skills:

```sh
node --test tests/integration/collection/github-family-consumer.test.mjs tests/integration/collection/federated-consumer.test.mjs
```

The consumer lives in a disposable directory outside the checkout. Passing checks
prove deterministic integration of the existing meta-skill helpers with the
authored fixture contracts. They do not prove semantic routing, actual package
behavior, current GitHub support, native readiness, ownership acceptance or a
published module.

Before a real module release, the proposed owner must accept accountability and
the initial scope; select the actual source and independent release policy;
review provenance, complete licenses and resources; decide and document the
standalone handoff contract; validate and evaluate the actual packages; obtain
independent review; and receive separate authorization for publication and any
consumer installation. This roadmap establishes a concrete next candidate,
without adding domain packages to the meta-skill collection.
