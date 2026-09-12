# Changelog

Notable changes are recorded here. Original content is licensed under Apache-2.0; releases are separate from pull request delivery.

## [Unreleased]

### Added

- Five focused, English, agent-agnostic skills for discovery, synthesis, design, authoring, and independent evaluation, with explicit handoffs and bounded iteration.
- Self-contained package licenses, optional authorship/tags/provenance and explained reasoning hints, local references, templates, and a synthetic workflow example.
- Canonical `.agents/skills` discovery, repository integration aliases, and optional Codex UI metadata with original SVG icons.
- Node.js utilities and a small layered repository validation architecture in `src/`, with commands and tool pins centralized in `package.json`.
- Portable authoring guidance, collection catalog, security and compatibility contracts, and reproducible upstream benchmark hashes for future evolution work.
- Standalone Node.js scaffolding and structural/evidence validators, synthetic regression tests, and explicit stable-workspace filesystem limits.
- Mandatory official `skills-ref validate` checks for every new or modified skill, with pinned source/dependency hashes and whole-collection PR coverage; Python is used only by the external official tool in the workflow.

### Changed

- Replaced the initial README with an English catalog, usage guide, and contributor entrypoint.
- Replaced mandatory model-profile/policy/evidence metadata with optional generic reasoning guidance and a metadata-free default scaffold.
- Documented native model, effort, invocation, and tool-permission fields across agents and verified OpenAI YAML authoring guidance.
- Extended local adapter checks to cover brand colors, optional invocation policy, and bounded remote MCP declarations without executing or granting them.
