---
"@i-9.ai/skills": patch
---

Include the complete public plugin listing in the portable and compatibility manifests, with a 26-character subtitle, a validated 512-pixel product icon, support links and published privacy and terms URLs at skills.i-9.ai.

Public submission now transparently excludes the optional `skills-usage-setup` persistent-command registration package and records the reason in artifact receipts; the full repository and npm distribution retain it. The public ZIP still provides no local MCP or lifecycle hooks, and provider approval remains a separate review.

Add readable privacy and terms pages to the website. For explicit local usage setup, show the exact registration and require its reviewed digest before writing a new registration; this binds the write to reviewed input but does not establish command safety or native execution.
