# I-9 Skills documentation

I-9 Skills is a public-ready framework for creating, validating, distributing, and evolving focused agent skills.

## Start here

- [Architecture](architecture.md): collection boundaries, specialist handoffs, and lifecycle.
- [Authoring standards](authoring-standards.md): package design and contribution requirements.
- [Compatibility](compatibility.md): portable contract and host-specific support.
- [Validation](validation.md): local checks and the official Agent Skills validator.
- [Release management](release-management.md): version preparation and Changesets.
- [Lifecycle policy](lifecycle-policy.md): portable maturity evidence and promotion decisions.
- [Entry-path map](assets/skill-management-entry-paths.html): an interactive view of the three main ways to start.
- [Visual guides](assets/index.html): a GitHub Pages-ready landing page for interactive maps.

## Deeper references
- [Distribution preparation](distribution-readiness.md): explicit JavaScript build, packed CLI verification and remaining publication gates.

- [Host hooks](host-hooks.md): host-specific session configuration and context output, with explicit untested runtime boundaries.

- [Positioning](positioning.md): public communication and demonstrations.
- [Skill usage MCP](skill-usage-mcp.md): local observed-read evidence and rankings, with an explicit emitter and dedicated database.
- [Planning protocol](planning-protocol.md): durable planning for material work.
- [Pilot runbook](pilot-runbook.md): a bounded, evidence-first procedure for the first external collection pilot.
- [Pilot evaluation](pilot-evaluation.md): current pilot evidence and limitations.
- [Upstream research](upstream-research.md): reviewed sources, adoption decisions, and provenance.
- [Security policy](https://github.com/i-9-ai/skills/blob/main/SECURITY.md): disclosure boundaries and security reporting.

`docs/` is the canonical public documentation tree. After a change to this directory merges into `main`, GitHub Actions mirrors it to the initialized GitHub Wiki. Create its first page and configure `WIKI_SYNC_TOKEN` before the first synchronization. The Wiki uses this page as `Home`.
