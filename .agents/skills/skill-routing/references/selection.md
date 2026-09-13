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
