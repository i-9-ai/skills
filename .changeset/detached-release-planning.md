---
"@i-9.ai/skills": patch
---

Fix Changesets release planning in GitHub Actions when the triggering commit is checked out with detached HEAD. Resolve the local default-branch reference to that verified commit before planning, without moving the checkout or changing pending release notes.
