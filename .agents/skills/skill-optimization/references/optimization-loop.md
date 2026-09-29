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

## Context-efficiency evidence

Treat context cost and information density as measured task evidence, not as style preferences. Freeze the comparison method before tuning:

- Use the target runtime's tokenizer when it is known and reproducible. Otherwise record UTF-8 bytes or characters as an explicitly labeled proxy; do not report a proxy as tokens.
- Score retained decisions, constraints, exceptions, and required examples alongside task success. A candidate that omits necessary information has lower semantic coverage even when it is smaller.
- When semantic coverage has a numeric rubric, report information density as that retained-information score per measured context unit. Otherwise keep coverage and context as separate measures instead of inventing a ratio.
- Count every artifact the ordinary path must load. For Mermaid, include the diagram source and any textual fallback required by the target; rendered pixels do not remove source context.
- Record navigation cost such as the number of bundled references loaded for an ordinary case. Independently needed topics may move behind clearly routed references, while the ordinary entrypoint retains its immediately usable normal example. Keep tightly coupled information together when almost always co-used; a larger file may cost less than repeated navigation.
- Compare the frozen baseline and candidate on the same cases and environment. Define a material improvement threshold before seeing candidate results.

Use the representation that expresses the information with the least measured context while preserving the required behavior:

| Representation | Prefer when | Check before retaining |
| --- | --- | --- |
| Concise prose | Nuance, rationale, or a short ordered rule matters | Removing words does not erase conditions or exceptions |
| Table | Several items share the same fields and readers compare them | Cells remain understandable and accessible without hidden prose |
| Mermaid | A flow, state change, sequence, hierarchy, or multi-node relationship is central | The target can parse or render it, the source stays readable, and measured total context beats the alternatives |
| Code or schema | Syntax, structure, or executable behavior is the source of truth | The artifact is complete enough to use and includes necessary explanation |
| Bundled reference | A topic is independently needed, provider-specific, advanced, exhaustive, or version-sensitive | Clear loading condition; the selected route remains complete and the entrypoint retains an immediately usable normal example |

Remove repeated explanations and keep one authoritative statement with a navigable handoff when needed. Do not replace useful prose with a diagram merely for visual appeal, and do not assume Mermaid is cheaper than prose: its benefit depends on topology, syntax overhead, renderer support, fallback needs, and the target tokenizer.

Record context comparisons in the optimization record:

| Metric | Baseline | Candidate | Acceptance rule |
| --- | --- | --- | --- |
| Task score | | | Meets the frozen quality threshold |
| Semantic coverage | | | No required decision or exception lost |
| Context unit and count | | | Material improvement under the frozen method |
| Ordinary references loaded | | | Does not hide common-path instructions |
| Clarity, accessibility, compatibility failures | | | No critical regression |

## Layout and completeness constraints

Body character, line, and token targets are advisory budgets, not grounds to omit required decisions, procedures, complete examples, or exceptions. Distinguish actual schema/specification constraints and collection validation bounds from discretionary size guidance. A textual edit budget constrains an optimization run; it never lowers its coverage floor. Preserve useful source corpus content even when adapting templates.

Retain an immediately usable normal example in the entrypoint. Keep tightly coupled information together when ordinary tasks almost always co-use it; split independently needed topics and provider adapters with explicit loading conditions. Select relevant references, never all by default, and measure loaded context together with navigation overhead and task coverage. Self-sufficiency applies to the installed package and selected route, not an optional offline mode.

## Portable adaptation

An execution host may use a local script, a compatible research tool, an agent harness, or a manual exercise with clearly labeled limits. The optimization contract remains the same: do not expose selection-validation cases during tuning, do not use final-acceptance cases during iterative selection, do not accept an edit without the final gate, and do not treat a higher tuning score, denser artifact, or smaller context proxy as proof of general improvement.

SkillOpt is licensed under MIT. Its source and model adapters are not included in this package. A user who elects to install it must follow its own installation, credential, data-handling, and licensing requirements.
