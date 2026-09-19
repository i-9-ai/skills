---
"@i-9-ai/skills": patch
---

Add `skills-maintenance-scheduling` to turn an approved recurring maintenance goal for an explicit skill collection revision into a reviewable schedule proposal. The package covers existing and absent project schedulers, explicit configuration handoffs, maintenance routing, evidence ownership, stop conditions, and rollback. Its optional `node scripts/validate_proposal.mjs <proposal.json>` helper rejects unbounded targets, credential-bearing fields, automatic approval, cadence-derived authority, and unsupported configuration claims. It does not configure a scheduler, run maintenance, modify skills, install packages, merge, publish, or approve work.
