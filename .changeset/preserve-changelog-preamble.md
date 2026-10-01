---
"@i-9.ai/skills": patch
---

Preserve existing changelog preamble and historical release bytes during `repo prepare-version`, including indented blank lines and mixed version-heading depths. Normalize only newly generated entries and reproduce the same output in repeated read-only `repo verify-release --base` checks.
