# Maintenance schedule contract

Load this reference when producing or validating the JSON artifact. The contract has three decisions:

- `propose`: recurrence is justified and the complete schedule proposal follows.
- `none`: no recurring schedule is justified; retain the bounded target and reason.
- `blocked`: a proposal depends on one unresolved target, scheduler, owner, authority, or secret-handling decision; retain the required action. Set `target` to `null` only when its bounded identity cannot yet be established; otherwise retain the complete frozen target.

All variants use `schema_version: 1`. A known target uses:

- `collection_id`: a stable lowercase identifier;
- `revision`: an immutable commit, digest, release, or content-addressed catalog identity;
- `packages`: one to 256 explicit package slugs, never a wildcard;
- `exclusions`: explicit package slugs outside the run.

## Proposal fields

| Field | Required content |
| --- | --- |
| `proposal_id` | Stable lowercase identifier for review and any later receipt |
| `maintenance_goal` | The approved recurring evidence or review outcome |
| `recurrence` | Rationale, human-readable cadence, ISO 8601 minimum interval, and calendar/event/hybrid trigger |
| `scheduler` | Project-local detection result, mechanism, real executor, execution mode, and configuration authority |
| `authority` | Approval system and owner plus explicit false controls for cadence, approval, modification, installation, merge, and publication |
| `route` | Ordered capability handoffs, each limited to proposing or collecting read-only evidence |
| `evidence` | Review owner, caller-owned destination, and artifacts required from every run |
| `stop` | Objective stop condition, failure behavior, and bounded maximum run count |
| `rollback` | Removal path for an authorized scheduler entry and retention path for evidence |

Use `scheduler.status: existing` only after read-only project-local evidence identifies the mechanism. Use `not-found` when the bounded search finds none and `ambiguous` when conflicting candidates remain. A missing scheduler still permits a portable proposal with a manual executor. It does not permit inventing or installing a framework.

`scheduler.configuration.authorization` is `not-authorized` by default. In that state, `adapter` is `null` and `receipt_required` is `false`. Set `explicitly-authorized` only when the caller separately authorized configuration and the scheduler is `existing`; name the verified adapter and require a receipt. The proposal remains the source for comparison, while the adapter owns the external configuration action.

Every route step contains:

- `capability`: an available package or equivalent project capability;
- `action`: `propose` or `collect-read-only-evidence`;
- `when`: the condition that activates the handoff;
- `output`: the evidence or proposal returned;
- `required`: whether the schedule is blocked when the capability is unavailable.

Companion names are recommendations, not dependencies. Verify the actual installed identity before a run. A manual evidence procedure may satisfy an optional route step when it produces the same bounded artifact.

## Safety invariants

- The proposal contains no token, password, credential, private key, API key, or secret field.
- `cadence_grants_authority` and all five `scheduled_run_can_*` fields are exactly `false`.
- Scheduled actions never exceed `proposal-only` or `read-only-evidence`.
- A moving revision such as `HEAD`, `latest`, `main`, or `current` cannot identify the target.
- Configuration authority does not authorize the maintenance route, and maintenance authority does not authorize configuration.
- A validator pass confirms contract shape and these invariants. It does not prove scheduler existence, owner approval, route behavior, provider support, or production readiness.

## Manual validation

When Node.js is unavailable, inspect the artifact against every table row and invariant above. Confirm that all package slugs are explicit and unique, the evidence destination belongs to the caller, the stop condition can be evaluated, and rollback identifies only the proposed scheduler entry. Record manual validation as a separate evidence level.
