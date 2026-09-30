---
"@i-9.ai/skills": minor
---

Group repository checks under `repo validate --project PATH` and pinned official Agent Skills conformance under `repo validate-official`. These replace the pre-release `validate` and `ci-official` CLI routes; the existing npm scripts continue to work. Official validation help now identifies its Python and prepared-CI requirements, while ordinary local checks remain offline.

Register all CLI routes explicitly so command filenames match their `Command` class names without changing hook, context, catalog, telemetry, plugin or MCP invocation paths. Both the Node 24 TypeScript checkout and compiled npm artifact use the same registration map. No host installation, database migration or new runtime dependency is introduced.
