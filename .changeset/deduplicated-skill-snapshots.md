---
"@i-9-ai/skills": patch
---

Store new skills-snapshot captures as complete manifests backed by shared SHA-256 objects, reusing unchanged file and symlink-text bytes instead of repeating full copies. Preserve verification and restoration of existing schema-1 backups.

Add explicit `--capture-link-target` preimage selection and `restore-preimage` for separately authorized recovery of linked files or packages, with permission checks and retained rollback. Ordinary restore changes link text only. Restored files are independent of shared objects; retention keeps objects and verifiable trashed manifests, without automatic garbage collection, encryption, or implicit target restoration.
