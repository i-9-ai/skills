---
"@i-9.ai/skills": patch
---

Resolve aggregate-catalog output ancestors before creation so a symlink cannot redirect a derived index into its source collection; rejected in-source outputs no longer create directories. Snapshot pruning now rejects linked or non-directory trash and checks its identity before moving retained manifests, preserving their access to shared snapshot objects.
