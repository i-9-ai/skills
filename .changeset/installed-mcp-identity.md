---
"@i-9.ai/skills": patch
---

Report the validated installed package version in the CLI and local plugin MCP
handshake instead of a fixed implementation version. Initialization reads only
the installed manifest, leaves catalogs and evidence storage untouched, and
rejects malformed package identity. The MCP protocol version remains independent.
