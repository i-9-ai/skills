---
"@i-9.ai/skills": minor
---

Add explicit local lifecycle evidence for routed, activated, completed, not-applicable, blocked and abandoned skill attempts. `telemetry record` accepts the closed schema-2 envelope, and `telemetry catalog-observe` records complete redacted catalog inventories. Transactional migration 3 preserves the existing read and telemetry history, with canonical retry handling, a shared event-ID namespace and source/session conflict checks.

Expose `telemetry lifecycle`, `overlap`, `inactivity` and `catalog-history`, with equivalent MCP tools `skill_lifecycle_record`, `skill_catalog_observe`, `skill_lifecycle_metrics`, `skill_routing_overlap`, `skill_catalog_inactivity` and `skill_catalog_history`. Queries require explicit UTC periods of at most 366 days, use reported attempts and catalog membership for their stated denominators, and return bounded pages. Catalog change details have their own cursor. Work and response limits fail explicitly instead of returning partial metrics; queries never create or migrate storage.

The evidence is caller-reported and opt-in: reads do not imply activation, package digests and Git provenance are assertions, and no prompts, responses, arbitrary annotations, upload or background collection are accepted. Dedicated evidence databases are rejected by the portable `skills-catalog-index` helper during both synchronization and rebuild, including `--reset-history`, preserving their history rather than replacing it with a derived catalog.

Bound MCP input lines to 1 MiB so complete catalog observations up to 256 KiB fit the transport; lifecycle events retain their 8 KiB limit. The lifecycle guide includes source-identity rules, event examples, CLI/MCP calls, ratio denominators and storage-upgrade recovery.
