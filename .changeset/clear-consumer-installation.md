---
"@i-9.ai/skills": patch
---

Rename the unpublished npm package to `@i-9.ai/skills`, retaining the `i9-skills`
executable and the `i-9-ai/skills` GitHub repository. Align installed-package
identity checks, packed tests, the lockfile and pending Changesets with that name.
Simplify installation examples to use `npx skills` and the direct GitHub toolkit
specifier without SHA placeholders or `--package`. Add Codex plugin installation
through the repository marketplace and a local checkout, including verification,
desktop discovery, updates and removal. Keep npm registry publication clearly
identified as pending until the scoped package is actually available.
