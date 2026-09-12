# Evaluation report template

- Candidate path and immutable identity:
- Official `skills-ref validate`: source revision/version, command, exit status, diagnostic, and matching candidate identity (missing execution blocks readiness):
- Baseline identity, or no-skill baseline:
- Brief, one responsibility, and expected output:
- Evaluation date, executor/evaluator roles, independence limitations:
- Environment, runtime/model when known, settings, and sample count:
- Case set identity; tuning vs untouched acceptance:
- Execution/authority scope and budget:

| Case | Class | Expected behavior | Actual outcome / artifact | Evidence | Result |
| --- | --- | --- | --- | --- | --- |
| example-case | positive / negative / functional / adversarial | Observable criterion | Observed result only | File or sanitized observation | pass / fail / blocked / not-run |

## Rubric and comparison

Report each critical and noncritical criterion separately. Explain measured differences from the baseline and unavailable measurements. Never invent time, cost, model coverage, or production usage.

## Verdict and handoff

Return `pass`, `fail`, or `blocked`, with critical findings, affected behaviors, evidence gaps, remaining iteration budget, and the creator's next action. Retain residual risks and the exact scope of a pass. This report does not authorize publication or change the candidate.
