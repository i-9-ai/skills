---
'@i-9.ai/skills': patch
---

Document the repository's six workflow resilience cases for `skill-authoring`
and `skills-refactoring`. Use `i9-skills benchmark prepare --suite
benchmarks/behavioral/resilience-suite.json --skills-root .agents/skills
--output ../skill-workflow-resilience-v1` from the source checkout to freeze
the fixtures and criteria for temporary read failures, existing approvals, and
deliberate access blocks. The suite is available in the source repository.
Preparation freezes inputs for external execution and produces no measured
agent results.
