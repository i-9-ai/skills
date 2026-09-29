---
"@i-9-ai/skills": patch
---

Add `skills-host-compatibility` to verify declared repository-local aliases for one canonical skill collection. Its self-contained Node.js 24+ helper, `node scripts/verify_aliases.mjs <contract.json>`, reports missing, broken, wrong-target, copied, and undeclared aliases from an explicit bounded contract, including absent host directories and dangling links. Manual inspection remains available without Node.js. It reports structural alias defects and limits without inspecting global installations, changing repository links, or claiming provider runtime behavior.
