---
"@i-9-ai/skills": patch
---

Add an explicit portable runtime and setup contract for authored skills. Repository-owned helpers and packaged Node.js utilities require Node.js 24 or newer; small helpers may stay dependency-free JavaScript, while TypeScript or another runtime requires a documented benefit and runnable distribution path. Packages that need preparation can declare a bounded `metadata.setup` script with prerequisites, idempotence, side effects, and a fallback; setup remains opt-in and never runs during installation or activation.
