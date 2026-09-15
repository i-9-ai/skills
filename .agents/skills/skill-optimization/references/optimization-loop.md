# Evidence-gated optimization loop

This reference adapts the method described by [Microsoft SkillOpt](https://github.com/microsoft/SkillOpt) at revision 79124b37e9a6371e13b753f8bcd7adb1e493ade1 (MIT) into a portable workflow. It records a methodology, not a bundled runtime dependency or copied implementation.

## Required controls

| Control | Purpose |
| --- | --- |
| Frozen baseline | Makes improvement and rollback comparable. |
| Tuning, selection-validation, and final-acceptance splits | Keeps the final acceptance evidence untouched by candidate selection. |
| Bounded edit budget | Limits instruction drift and keeps each candidate reviewable. |
| Scored rollouts | Grounds diagnosis in observed task outcomes. |
| Final acceptance gate | Promotes only the selected candidate when it meets the stated threshold. |
| Rejected-change record | Preserves negative evidence and prevents repetitive regressions. |
| Best accepted revision | Separates experimentation from the artifact offered to lifecycle review. |

## Layout and completeness constraints

Body character, line, and token targets are advisory budgets, not grounds to omit required decisions, procedures, complete examples, or exceptions. Distinguish actual schema/specification constraints and collection validation bounds from discretionary size guidance. A textual edit budget constrains an optimization run; it never lowers its coverage floor. Preserve useful source corpus content even when adapting templates.

Retain an immediately usable normal example in the entrypoint. Keep tightly coupled information together when ordinary tasks almost always co-use it; split independently needed topics and provider adapters with explicit loading conditions. Select relevant references, never all by default, and measure loaded context together with navigation overhead and task coverage. Self-sufficiency applies to the installed package and selected route, not an optional offline mode.

## Portable adaptation

An execution host may use a local script, a compatible research tool, an agent harness, or a manual exercise with clearly labeled limits. The optimization contract remains the same: do not expose selection-validation cases during tuning, do not use final-acceptance cases during iterative selection, do not accept an edit without the final gate, and do not treat a higher tuning score as proof of general improvement.

SkillOpt is licensed under MIT. Its source and model adapters are not included in this package. A user who elects to install it must follow its own installation, credential, data-handling, and licensing requirements.
