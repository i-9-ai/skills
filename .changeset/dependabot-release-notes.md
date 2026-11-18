---
"@i-9.ai/skills": patch
---

Add missing Changesets to supported Dependabot pull requests after release-note validation. npm updates receive a patch note; GitHub Actions-only updates receive an empty Changeset. Preserve existing notes and reject stale or unsupported branches without executing contribution code. GitHub may require approval before CI runs on the generated commit.
