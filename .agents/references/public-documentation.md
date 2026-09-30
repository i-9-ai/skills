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
- [Architecture.md](../../docs/Architecture.md): responsibilities, handoffs, failure, and scope.
- [Authoring Standards.md](../../docs/Authoring%20Standards.md): contributor requirements and single responsibility.
- [Upstream Research.md](../../docs/Upstream%20Research.md): pinned source comparison and reuse decisions.
- [Compatibility.md](../../docs/Compatibility.md): portable core and actual test coverage.
- [Validation.md](../../docs/Validation.md): required official validation, pinned setup, and PR coverage.
- [Pilot Evaluation.md](../../docs/Pilot%20Evaluation.md): actual forward-exercise results and their limitations.
