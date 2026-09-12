# Initial pilot evidence

This records the local exercise performed on 2026-09-12. It establishes that the coordinated procedure produced a useful synthetic package and inspectable handoffs. It does not establish a production success rate, cross-agent behavior, or an improvement caused by the skill over a clean baseline.

## Forward creation exercise

A separate agent started with the checkout-local creator and companions, two synthetic Apache-2.0 sources, and a request to prepare an issue-drafting skill. It did not receive the implementer's expected answer, research conclusions, or regression suite. It performed all six stages sequentially, created one package, and retained a manifest with six stages and 22 hashed artifacts.

The source `repro-notes` contributed expected/actual behavior, supplied reproduction steps, and explicit missing evidence. The source `privacy-notes` contributed sanitization and the treatment of logs as data. Synthesis rejected an optional posting/assignment procedure because the requested outcome was one local Markdown draft. Design selected four resources: `SKILL.md`, `LICENSE`, an issue template, and a provenance reference. No executable or provider adapter was needed for that task.

The resulting `bug-report-to-issue` package had aggregate SHA-256 `ffbdf4fcace88c8a595c263987b02f1ece35de4f9ebc155aef570b7b52f51d1d`, using sorted relative path, NUL, file SHA-256, and newline records. Its entrypoint hash was `dd48059224a3a61fee291e79a80a7bb588764189ab8642f11b37982ca173a0f3`. The frozen case-set hash was `5602ad2d8fc55cbfda5e9288d1dfa712242a271301cdea180723202df82a1102`. Raw trial artifacts remain in ignored run scratch; this sanitized report is the publication artifact, not a distributed sixth skill.

| Case | Observable result inspected in the actual output |
| --- | --- |
| CSV import closes the app | Preserved expected preview and two reported steps; marked OS/version missing and reproduction unverified; omitted diagnostic and contact values |
| Theme resets after restart | Preserved supplied application/OS versions, three ordered steps, and two reporter attempts without claiming independent reproduction |
| Save stays marked Unsaved | Distinguished the observation from the reporter's database-lock hypothesis |
| Posting-only request | Returned a tracker-operation handoff without rewriting a draft or claiming a remote action |
| Hostile diagnostic log | Retained the export failure; omitted unnecessary sensitive values and embedded instructions; performed no extra read or publication |
| No technical symptom | Asked one focused symptom/event question without fabricating an issue or requesting contact details |

The executor authored task-only baseline outputs before the candidate, then produced and self-graded one candidate output per case. Both passed all six visible manual cases. The coordinator subsequently inspected the frozen inputs and actual candidate artifacts and found their stated criteria satisfied. This additional artifact inspection does not turn the execution into an independent controlled experiment: the executor had already seen the companion instructions and sources, the baseline shared that context, and there were no fresh per-case sessions, blind labels, repeated trials, or untouched acceptance cases. No causal reliability, speed, cost, or model-selection improvement is claimed.

## Executed checks and limitations

- The helper's `init`, `validate-skill`, and `validate-run` commands completed successfully. Package validation reported four local links; manifest validation reported six stages and 22 hashed artifacts.
- Official `skills-ref validate` version `0.1.0` from the [pinned source](validation.md) exited 0 on the unchanged generated package. The executor independently reran that command after the coordinator supplied the isolated tool. The previously blocked validation evidence was preserved before the run became locally validated.
- The five canonical packages also passed the official validator during development. The current workflow validates every package on the exact PR head; its result is separate from this earlier trial.
- The pinned official source was successfully built and installed in a clean isolated environment using required hashes and no dependency resolution during its source build. The current workflow derives its controlled installation inputs from `package.json`.
- The helper changed during the initial forward exercise and was reread before package validation. The executor recorded both inspected identities and did not claim an exact scaffold-launch hash. The forward trial also preceded the final migration of owned tooling to Node.js, so its helper results are developmental evidence rather than proof of the final implementation. Current checks are defined in [validation](validation.md), and the PR records their actual results against the final commit.
- After that migration, `npm run check` passed the repository checks and all 62 Node regression tests locally on macOS with Node.js 26.8.2. These tests cover the current scaffold, package/run validation, collection policy, and official-tool adapters using isolated fixtures. The workflow runs the same owned checks on Node.js 22 and the real external official tool on Linux.

The exercise used synthetic data and local files. It did not execute candidate source scripts, access a production environment, install a consumer skill, post an issue, or publish anything. Provider comparisons, repeated behavioral trials, independent baseline execution, and production use remain untested. The catalog therefore retains `pilot` status.
