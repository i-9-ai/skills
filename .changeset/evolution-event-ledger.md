---
"@i-9-ai/skills": minor
---

Add ordered SQLite schema migration plus `evolution-record`, legacy `evolution-prove`, and `evolution-events` commands to the standalone aggregate-catalog helper for durable skill rename, merge, split, create, retire, update, and relink evidence. Events retain their sync run, package revisions, affected files, before and after state, validation, snapshot reference, verified package-byte or reverse-patch proof, host-link/worktree map, and explicit `.system` exclusion; the JSON fallback remains current-state only. These record skill-change evidence, not execution tasks; Beads remains the local task source of truth.
