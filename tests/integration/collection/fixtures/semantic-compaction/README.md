# Synthetic preservation rubric fixture

This fixture demonstrates the compaction rubric on a tiny report policy. It is
original synthetic data, not a deployable skill package. Every ordinary route
loads its entrypoint and policy.json once, as declared by the test-only route contract in cases.json. The contract controls this interpreter's resource loading; it is not parsed from natural-language instructions. Both versions use the same bounded
policy interpreter in the integration test; neither executes external code.

The corpus and 10% UTF-8 byte reduction threshold were written before the first
test execution. All cases were visible to the fixture author: the named tuning,
selection and acceptance groups illustrate the procedure, but are **not held-out
model evidence**. The policy objects intentionally match. Tests show that the
rubric catches explicit policy mutations; they do not infer natural-language
meaning, prove an agent reads the policy, or evaluate the modified meta-skills.

| Required unit | Baseline source | Candidate destination | Evidence boundary |
| --- | --- | --- | --- |
| UTF-8 and id schema | entrypoint + policy | entrypoint → policy encoding/required | Field check; no encoding runtime benchmark |
| Unique IDs and ordinary example | entrypoint + policy example | entrypoint + policy unique/example | Field/example check; no real CSV exporter |
| Exact output approval and default preview | entrypoint + policy | entrypoint → policy approval/output | Synthetic decision cases and wrong-file mutant |
| Schema before row failure | entrypoint + policy order | policy order | Synthetic ordering case and reversed mutant |
| Invalid-row diagnostic, no write | entrypoint + policy | entrypoint + policy row gate | Refusal tested; actual row-number diagnostic not executed |
| Parser dependency | entrypoint + policy | entrypoint + policy dependency | Missing-dependency case and omitted-gate mutant |
| Proposed evidence stays unresolved | entrypoint + policy | entrypoint + policy evidence | Proposed-state case and omitted-gate mutant |
| Source conflict blocks | entrypoint + policy | entrypoint + policy conflict gate | Conflict case and omitted-gate mutant |
| Mandatory resource remains ordinary | baseline entrypoint routing | candidate entrypoint routing | Declared-route loading and hidden-preview-route mutant; dependency cost counted |

Forward inspection maps all listed units; reverse inspection finds no added
permission. Duplicate prose in the baseline is replaced by a canonical policy
reference. This is a demonstration with declared coverage, not a compression
ratio for the repository, a losslessness guarantee, or an agent behavioral pass.
