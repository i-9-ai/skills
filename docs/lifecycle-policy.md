# Lifecycle policy

The collection uses a portable maturity policy. It does not require a specific source-control host, CI service, ticket system, approval tool, or deployment platform.

The canonical operational policy is bundled with [`skill-lifecycle-review`](../.agents/skills/skill-lifecycle-review/references/lifecycle-policy.md). In a consumer project, the reviewer first identifies the system already used for evidence and approval. That may be a pull-request review, CI gate, issue tracker, change-control record, signed release process, local review procedure, or another declared mechanism.

If such a system exists and is authorized, the lifecycle decision records its identity, the reviewed revision, the decision, and any open findings. If it does not exist, the reviewer creates a portable approval record naming the candidate revision, evidence, acceptance owner, required decision, and next review trigger. Absence of a system never becomes implied approval.

## States

| State | Meaning |
| --- | --- |
| `pilot` | Available for bounded use while behavior and compatibility are exercised. |
| `stable` | Supported by current, reviewable evidence of repeated useful use, with no unresolved critical blocker in scope. |
| `deprecated` | Still discoverable for transition, but unsuitable for new work. |

## Promotion from pilot

A promotion requires current structural and official validation, behavior evidence from the collection's evaluation method, recorded useful outcomes, appropriate security/provenance/compatibility evidence, no unresolved critical blocker, and an approval through the identified local system or portable record.

A collection may define a stricter numeric threshold. Until it does, a reviewer keeps the package in `pilot` rather than inventing one.

## Regression and retirement

Move a stable package back to `pilot` when evidence is stale or a material behavior or compatibility question remains unresolved. Deprecate it only with a clear successor or removal path. Lifecycle review records the decision; catalog mutation, publication, and migration remain separate authorized actions.
