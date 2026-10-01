---
"@i-9.ai/skills": minor
---

Share native and CLI skill-read evidence at `~/.agents/skills-usage.db` by
default, with explicit `I9_AGENT_STATE_ROOT`, `I9_SKILLS_USAGE_DB` and command
database overrides. Automatic plugin data variables no longer split evidence
by host. Existing databases are never moved, merged or deleted implicitly.

Add bounded Codex literal shell-read verification and Gemini/Copilot read
adapters alongside Claude observations. Queries remain read-only; explicit
writers initialize selected safe state lazily. Store opaque identities and
bounded metadata, without raw prompts, commands or file content. Receipt
counts signal demand rather than activation. Gemini and Copilot receipts do
not establish reliable pre/post call correlation, and supported payload tests
do not prove universal native-host delivery or trust.
