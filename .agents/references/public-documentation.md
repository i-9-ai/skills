# Collection documentation

## Purpose
Describe the architecture, shared authoring policy, research basis, and supported use.

## Ownership
Maintainers own these contracts; packages remain self-contained at runtime.

## Local contracts
English only. Distinguish reviewed sources, implemented behavior, structural checks, model evaluation, and production experience. Do not include private harness content or host paths.

## Work guidance
Keep shared policy here and task-specific procedure inside its package. Update consumers when interfaces change. Links to external sources record evidence rather than granting tool authority.

Links between pages in `docs/` use the rendered GitHub Wiki URL and page title:
`https://github.com/i-9-ai/skills/wiki/Authoring-Standards`. Omit the Markdown
extension and replace title spaces with hyphens; preserve section anchors.
References to repository source or upstream files use their actual file URLs.
The mirror's relative-link conversion is a compatibility fallback, not the
documentation authoring convention.

## Verification
Run repository link and public-hygiene checks. Verify upstream revisions and scoped licenses before changing reuse decisions.

## Child DOX index
- [Skill Quality.md](../../docs/Skill%20Quality.md): explicit exact-revision quality receipts, preserved coverage and bounded shared CLI/MCP inspection; no universal quality score or inferred readiness.
- [Collection Modules.md](../../docs/Collection%20Modules.md): reviewed module admission, independent ownership, collision and update boundaries; no automatic module installer or publisher authentication.
- [Architecture.md](../../docs/Architecture.md): responsibilities, handoffs, failure, and scope.
- [Authoring Standards.md](../../docs/Authoring%20Standards.md): contributor requirements and single responsibility.
- [Upstream Research.md](../../docs/Upstream%20Research.md): pinned source comparison and reuse decisions.
- [Compatibility.md](../../docs/Compatibility.md): portable core and actual test coverage.
- [Optional Skill Telemetry.md](../../docs/Optional%20Skill%20Telemetry.md): explicit optional registration ownership, runtime availability and data-preserving removal.
- [Credential Detection.md](../../docs/Credential%20Detection.md): native security settings and bounded reproducible CI scanning with redacted failure output.
- [Public Plugin Submission.md](../../docs/Public%20Plugin%20Submission.md): skills-only ZIP preparation and separate provider identity, upload and review boundaries.
- [Validation.md](../../docs/Validation.md): required official validation, pinned setup, and PR coverage.
- [Behavioral Benchmark.md](../../docs/Behavioral%20Benchmark.md): closed synthetic freezes, immutable artifact-backed run receipts and declared baseline/treatment comparisons; byte integrity does not authenticate agent execution or certify readiness.
- [Pilot Evaluation.md](../../docs/Pilot%20Evaluation.md): actual forward-exercise results and their limitations.
- [Native Plugin Pilot.md](../../docs/Native%20Plugin%20Pilot.md): historical pinned host observations and the explicit disposable lifecycle operator; source/tests, native evidence and independent acceptance remain separate.
