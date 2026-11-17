---
"@i-9.ai/skills": minor
---

Collect an explicit skill routing decision through `telemetry route --file
decision.json` and MCP `skill_routing_record`. Observe 1–24 selected local
packages, then atomically emit `skill.routed` events sharing one correlation
UUID. Deterministic member IDs deduplicate retries and conflicting decisions
roll back completely. Store logical identities and package digests without
local paths or package contents. The available-skills overview describes the
explicit caller handoff. Startup and read hooks continue to report their own
observations. CLI/MCP integration tests cover collection, retries, concurrent
writers, rollback and overlap results in disposable state.
