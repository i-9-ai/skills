# Evidence promotion guide

This guide distills production operating patterns without copying internal records, identities, paths, credentials, or customer data. It applies to one candidate skill evolution.

## Classify before changing

Classify each signal before selecting an action:

| Evidence class | Typical support | Allowed destination |
| --- | --- | --- |
| Strong | Repeated observed failure, exact validation result, approved decision, or immutable upstream change | A scoped candidate change and required validation |
| Moderate | Repeated qualitative pattern, review finding, or comparable benchmark | Candidate record, bounded experiment, or human review |
| Weak | One-off anecdote, unverified suggestion, stale observation, or popularity signal | Hypothesis or research note only |

Record why the class fits. A source can be useful without being strong enough to alter active behavior.

## Promote only the smallest safe action

Apply a local correction only when its evidence is strong, its effect stays within the existing skill boundary, the caller authorized edits, and the required checks are available. Preserve the baseline revision and the reason for the change.

Keep weak or incomplete signals visible as a hypothesis, candidate, or experiment input. Do not convert them into mandatory instructions, new skills, automatic installation, publication, or external actions.

## Repairing an inherited broken baseline

Normal evolution compares a candidate with a frozen passing baseline. A package that already fails a known required check may still be repaired, but only as an explicit exception: freeze the exact package revision, failing command or observation, expected repair, and acceptance checks before editing. The repair candidate must pass the formerly failing checks and all other required gates. Preserve the original failure evidence for rollback and diagnosis; never relabel it as a passing baseline or infer that unrelated behavior was preserved.

## Route material changes

An evolution must hand off rather than decide alone when it changes:

| Change | Handoff |
| --- | --- |
| Behavioral acceptance or test strategy | `skill-evaluator` |
| Security, disclosure, credentials, or unsafe tool use | `skill-security-review` |
| Maturity, adoption, deprecation, or lifecycle state | `skill-lifecycle-review` |
| External distribution or public release | `skill-publication` |
| A new responsibility, split, rename, or structural change | `skill-design` or `skill-authoring` |
| Missing, unsafe, duplicated, or responsibility-misaligned package icon | `skill-icon-design` |

The handoff preserves the evidence classification and candidate revision. It does not grant authority to make the downstream decision.

## Rollback and negative evidence

When validation fails, a duplicate capability is found, or new evidence weakens the change, retain the rejected candidate and reason, then return to the recorded baseline. Negative evidence prevents repeated, unsupported attempts and remains distinct from an accepted package revision.
