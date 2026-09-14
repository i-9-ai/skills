# Selection rules

## Decision types

| Result | Use when |
| --- | --- |
| `single` | One package owns the requested output and satisfies the material constraints |
| `sequence` | Two or more packages produce distinct required outputs with compatible handoffs |
| `ambiguous` | Up to three plausible routes remain and one missing fact changes the decision |
| `none` | No clear match exists, a skill would expand scope, or ordinary capability is sufficient |

A catalog match is a shortlist signal. Final routing should use the actual package boundary when accessible. A high-confidence route needs a verified package identity and a direct responsibility match; maturity does not compensate for a poor match.

## Comparison order

1. Required primary output and positive activation trigger.
2. Explicit boundary and near-miss exclusions.
3. Inputs, side effects, dependencies, and authority fit.
4. Handoff compatibility when a sequence is necessary.
5. Maturity and evidence limits.
6. Name, tags, and wording similarity as discovery aids only.

Do not select a deprecated package silently. Do not treat `stable` as universal compatibility or `pilot` as unusable. When two catalogs contain the same name, identify each catalog and inspect package identity before choosing.

## Confidence

- `high`: exact responsibility match, verified package instructions, compatible inputs and boundaries.
- `medium`: strong catalog match with a material detail unverified but disclosed.
- `low`: insufficient for activation; return `ambiguous` or `none` instead of a single route.

Coverage is scoped to the supplied and successfully read catalogs. “No match in the inspected catalogs” is not a claim that no relevant skill exists elsewhere.

## Setup readiness

Inspect the candidate's `compatibility` and `metadata.setup` fields plus read-only evidence already available for the selected environment. Report exactly one state:

| State | Use when |
| --- | --- |
| `ready` | The package is present, no explicit setup remains, and every material prerequisite is confirmed. A caller-supplied setup receipt may confirm that a declared setup already ran for this exact package and environment. |
| `prerequisite missing` | The package is present and at least one required compatibility prerequisite is demonstrably absent, with no declared setup entrypoint that owns the remedy. Preserve any documented fallback. |
| `explicit setup available` | The package is present, declares a valid package-relative `metadata.setup` entrypoint, and setup completion for the exact environment is not established. Report prerequisites, side effects, and fallback from the package; do not execute it. |
| `setup status unknown` | Package instructions or environment evidence are unavailable or too incomplete to establish one of the other states. Do not guess. |

Package presence is separate from readiness. If the selected package is missing, report that fact outside this four-state classification and hand off to `skill-installation` only when installation is authorized. Installation records declared setup as `not-run`; it never turns `explicit setup available` into `ready`.
