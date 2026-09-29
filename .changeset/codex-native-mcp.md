---
"@i-9-ai/skills": minor
---

Register the shared local skill MCP directly in the repository-root Codex plugin.
The verified legacy mapping resolves the dependency-free Node 24 entrypoint from
the installed plugin and forwards explicitly selected `PLUGIN_DATA`; catalog,
report and guide operations work without storage. Storage tools fail as unavailable
when no data directory is supplied. Relative, linked and plugin-contained data is
rejected; the caller must also keep it outside consumer projects because this
legacy process cannot infer the consuming thread's cwd. Native isolated discovery,
tool calls and data-preserving cleanup are documented separately from model use,
hosted updates and publication. No skill copy, automatic installation or telemetry
activation is introduced.
