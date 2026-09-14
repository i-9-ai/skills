# Skill routing decision

- Task and required output:
- Catalogs and package identities inspected:
- Result: `single` / `sequence` / `ambiguous` / `none`
- Confidence: `high` / `medium`

| Candidate | Responsibility fit | Package presence | Setup readiness | Boundary or dependency concern | Decision |
| --- | --- | --- | --- | --- | --- |
| Canonical skill and catalog | Direct evidence from description or package | Present / missing / unknown | `ready` / `prerequisite missing` / `explicit setup available` / `setup status unknown` | None, disclosed limit, fallback, or mismatch | Select / reject / needs input |

## Route

For `single`, name the package and the input to pass. For `sequence`, list each package in order with its distinct output and next consumer. For `none`, explain why ordinary capability is enough or what capability is missing. For `ambiguous`, ask only for the fact that separates the remaining candidates.

If a selected package is missing and installation is authorized, name `skill-installation` as a handoff. If it is present and exposes setup, point to that package's documented explicit setup and state that setup still requires caller authorization. Never run setup or install dependencies during routing.

## Limits

Record unreadable packages, stale or partial catalogs, name collisions, unavailable dependencies, and environments not inspected. The decision recommends activation; it does not perform it or grant authority.
