---
"@i-9.ai/skills": patch
---

Avoid falsely refusing concurrent evidence writers when SQLite removes a journal
while its pathname inspection returns a detached regular inode. Inspect that
sidecar pathname once more and validate any current replacement with the same
regular, single-link file rules. Keep the primary database strict, reject unsafe
replacements and repeated invalid observations, and preserve the five-second
SQLite lock timeout without retrying writes or resetting evidence.
