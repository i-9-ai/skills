# Evidence packet schema

Use a run-local Markdown or JSON record. Keep the canonical evidence packet outside an installed package unless the caller explicitly owns that workspace.

## Required fields

| Field | Meaning |
| --- | --- |
| `target` | Skill or collection name, path or installed identity, and frozen revision when available. |
| `question` | One decision question this packet supports. |
| `scope` | Included behavior, sources, time window, and exclusions. |
| `records` | Normalized evidence records. |
| `limitations` | Missing data, confounders, untested conditions, and uncertainty. |
| `handoff` | Named destination specialist or `none`, with reason. |

## Evidence record

Each record contains:

- `id`: stable local identifier;
- `kind`: `observation`, `test-result`, `reviewed-source`, `reported-experience`, or `hypothesis`;
- `claim`: a concise, attributable statement;
- `source`: identity and authorized locator; use a sanitized locator for private material;
- `target_revision`: target bytes or revision observed;
- `method`: how the item was obtained, without executable instructions;
- `confidence`: `high`, `medium`, or `low`, with reason;
- `sensitivity`: `public`, `restricted`, or `private`;
- `limitations`: uncertainty, conflicts, and conditions;
- `artifact_hash`: SHA-256 only when an owned local artifact must be resumed or checked.

## Classification guide

- **High confidence:** direct reproducible observation or a frozen test result tied to the target revision.
- **Medium confidence:** reviewed source or independently corroborated report with relevant scope.
- **Low confidence:** a single report, incomplete observation, trend signal, or plausible but untested explanation.
- **Hypothesis:** a question or proposed explanation. It is never an observed result.

Confidence records evidence strength; it does not approve change, release, or installation. Preserve a negative result even when it weakens a favored proposal.
