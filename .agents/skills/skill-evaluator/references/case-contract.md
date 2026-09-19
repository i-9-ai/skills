# Portable evaluation cases

The case template is a complete small example; replace its task and assertions
for the candidate. It is not a model API, universal benchmark, or executable
schema. A caller can use equivalent Markdown when no JSON tooling is available.

Each case needs a stable ID, phase (exploratory, tuning, selection-validation,
or final-acceptance), class, realistic prompt, fixtures, allowed effects,
observable assertions with criticality, and a bounded attempt/time budget.
Fixture paths are relative to a disposable case directory. Resolve them within
that directory and reject links or traversal before giving an executor access.
Never store credentials, real home paths, or the desired solution in fixtures.

Keep assertions in the evaluator's record. Give the executor only the prompt,
authorized fixtures and effects, candidate, and execution limits. Use the same
inputs and limits for the frozen baseline. Hash the case set before execution;
record candidate identity and test environment separately from the case.

For each attempt record case ID, phase, actual artifacts, observed effects,
assertion verdicts, sanitized evidence locators, duration when measured, and
pass/fail/blocked/not-run. A missing executor is not a failed skill and is not
a pass. Inspect outputs as well as exit status. An exploratory result can
motivate a new case, but cannot retroactively become untouched final evidence.

Example result: this template with no supplied source should return a missing
input report and no manufactured file. That is an expected outcome, not an
executed observation. A final report must state what actually happened.
