---
"@i-9-ai/skills": minor
---

Clarify public repository security guidance and remove visibility-dependent
assumptions from the implementation plans. Refresh the source/history and GitHub
exposure assessment and document the separately verified main-protection policy.
Build the compiled CLI during explicit npm preparation so an immutable Git-source
`npx --package=... i9-skills` invocation can run without a global CLI installation.
Document preparation side effects and preserve dependency-free plugin hooks.
The npm package remains protected from accidental publication; public Git hosting
does not publish a registry release or submit a marketplace listing.
