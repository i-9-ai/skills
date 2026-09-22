# Portable lifecycle policy

## Purpose

Assess one skill's maturity from evidence without requiring a particular source-control host, CI service, ticket system, approval tool, or deployment platform.

## States

| State | Meaning |
| --- | --- |
| `pilot` | The package is available for bounded use while its behavior and compatibility are being exercised. |
| `stable` | The package has current, reviewable evidence of repeated useful use and no unresolved critical blocker in its declared scope. |
| `deprecated` | The package remains discoverable for transition purposes but should not be selected for new work. |

## Evidence and local review system

Before deciding a transition, identify the target project's actual evidence and approval system. It may be a pull-request review, CI gate, issue tracker, change-control record, signed release process, local review procedure, or another declared mechanism.

Use that system when it is available and authorized. Record its identity, the reviewed revision, the decision, and any open findings. Do not require GitHub, GitLab, or a named vendor.

When no system is available, return a portable approval record that names the candidate revision, evidence, acceptance owner, required decision, and follow-up trigger. Do not infer approval or promote the package.

## Transition rules

### Pilot to stable

Require all of the following:

- current structural and official validation for the candidate revision;
- behavior evidence from the collection's declared evaluation method;
- recorded useful outcomes in the target context or other approved contexts;
- security, provenance, and compatibility evidence appropriate to the package scope;
- no unresolved critical blocker; and
- an approval recorded through the identified local review system or the portable approval record.

The criteria above are the portable default. Evidence must demonstrate repeated useful outcomes rather than one successful run. A collection may set a stricter numeric threshold; apply it when declared, but do not invent a threshold or block an otherwise supported transition merely because no number was configured.

### Stable to pilot or deprecated

Return a package to `pilot` when its evidence becomes stale or a material compatibility or behavior question is unresolved. Mark it `deprecated` when a successor or removal path is explicit and new selection would be harmful or misleading. Preserve a transition path and prior evidence.

## Boundaries

This policy records a decision outside the inventory catalog. The catalog contains package identity and routing metadata, not a lifecycle or maturity field. This policy does not mutate the catalog, edit a package, merge a change, publish a release, or create approval authority.
