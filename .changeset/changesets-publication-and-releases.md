---
"@i-9.ai/skills": patch
---

Complete the Changesets release workflow: prepare aligned package/plugin versions in a draft PR, then publish the checked compiled artifact with npm Trusted Publishing and create its Git tag and GitHub release after the reviewed merge. Preserve bounded note validation and verify generated release content before publication.

Add an explicit recovery dispatch for the missing 0.1.0 GitHub release at its original reviewed commit, without uploading that npm version again. Update installation and release instructions to reflect the available public registry package and the exact workflow publisher binding.
