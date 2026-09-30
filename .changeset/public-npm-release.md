---
"@i-9.ai/skills": patch
---

Prepare public npm distribution by removing the private-package guard and
declaring public registry access with the `latest` tag. Keep the single
`i9-skills` executable, compiled runtime and bundled meta-skills. Version
preparation and package upload remain explicit operations; source merges and
session hooks never publish a package automatically.
