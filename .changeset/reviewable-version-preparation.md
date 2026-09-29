---
"@i-9-ai/skills": minor
---

Add `repo prepare-version` and `repo verify-release` for reviewable version
preparation. Changesets generates the version and changelog; the adapter aligns
the npm lockfile and Codex, Claude and Copilot plugin manifests, preserves other
metadata, restores captured files after failure, and succeeds without changes
when no notes remain.

Provide a manually dispatched, default-branch-only workflow that creates or
updates a draft version PR only when the local Changesets plan contains a package
version bump. Empty-note-only input stays untouched for a later release.
Release-note validation accepts consumed Changesets
only when the strict verifier confirms the generated-only diff and recomputes
the version from the base commit's notes. Normal checks and review remain
required. The workflow does not publish packages, tags, releases or marketplace
entries; local release preparation requires source-checkout development
dependencies.
