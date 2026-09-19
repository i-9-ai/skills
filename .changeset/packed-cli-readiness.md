---
"i9-skills": minor
---

Prepare the unified CLI for an explicitly built local package with a deliberate
files allowlist and repository metadata. Checkout execution keeps native
TypeScript; packed execution uses compiled JavaScript and the same launcher.
Add a clean Node 24 node_modules artifact test without installing dependencies or
running lifecycle scripts. Keep the package private and publishing unconfigured.
Install the lockfile in validation CI before running dependency-based checks,
and verify the compiled package there without publishing it.
