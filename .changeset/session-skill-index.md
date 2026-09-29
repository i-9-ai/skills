---
"@i-9-ai/skills": patch
---

Add an optional project-local Codex session index generated dynamically from current project and global skill entrypoints, with canonical-path deduplication and disclosed omissions. It provides the same bounded, read-only metadata map through a trusted SessionStart hook or `context available-skills`; it does not load whole package bodies, select a route, install packages, or modify the repository.
