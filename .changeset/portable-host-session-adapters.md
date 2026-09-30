---
"@i-9.ai/skills": minor
---

Add host-specific session configuration and context output for Codex, Claude
Code, GitHub Copilot CLI and Gemini CLI through the same TypeScript context core.
Use hook session-config --host, hook verify --host, and hook session-index --host.
Generation is read-only and verification compares standalone JSON; no hooks are
enabled. POSIX checkout configurations are fixture-tested. Native host execution,
OpenCode's plugin adapter and automatic read telemetry for hosts other than
the separately implemented Claude Read adapter remain unimplemented.
