# Skill routing decision

- Task and required output:
- Catalogs and package identities inspected:
- Result: `single` / `sequence` / `ambiguous` / `none`
- Confidence: `high` / `medium`

| Candidate | Responsibility fit | Boundary or dependency concern | Decision |
| --- | --- | --- | --- |
| Canonical skill and catalog | Direct evidence from description or package | None, disclosed limit, or mismatch | Select / reject / needs input |

## Route

For `single`, name the package and the input to pass. For `sequence`, list each package in order with its distinct output and next consumer. For `none`, explain why ordinary capability is enough or what capability is missing. For `ambiguous`, ask only for the fact that separates the remaining candidates.

## Limits

Record unreadable packages, stale or partial catalogs, name collisions, unavailable dependencies, and environments not inspected. The decision recommends activation; it does not perform it or grant authority.
