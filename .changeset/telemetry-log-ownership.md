---
'@i-9-ai/skills': patch
---

Reject diagnostic log and rotation paths that overlap the usage database, SQLite sidecars or event input. Canonical alias checks run before any writer opens, preventing configured log rotation from replacing selected data.
