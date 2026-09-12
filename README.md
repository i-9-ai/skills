# I-9 Skills

A curated collection of focused, reusable skills. Each skill has one responsibility, is written in English, includes its own `LICENSE`, and describes capabilities without requiring a particular AI agent or provider.

The initial collection builds and improves other skills through explicit handoffs:

```mermaid
flowchart LR
    C[skill-authoring: author and coordinate] --> F[skills-discovery: qualify sources]
    F --> M[skills-synthesis: synthesize contributions]
    M --> B[skill-design: decide the design]
    B --> C
    C --> E[skill-evaluator: assess behavior]
    E --> R[Scoped evaluation report]
    C -. when naming is unresolved .-> N[skill-naming: decide the name]
```

The arrows represent returned artifacts, not recursive skill invocations. The creator may consult `skill-design` during intake when the responsibility is unclear. Synthesis requires at least two distinct usable sources; otherwise it is explicitly skipped. Evaluation failures return to authoring within a bounded correction budget.

| Skill | One responsibility | Primary output |
| --- | --- | --- |
| [skill-authoring](.agents/skills/skill-authoring/SKILL.md) | Author a complete package and coordinate its handoffs | Skill package |
| [skills-discovery](.agents/skills/skills-discovery/SKILL.md) | Discover and qualify relevant sources | Candidate report |
| [skills-synthesis](.agents/skills/skills-synthesis/SKILL.md) | Select complementary contributions and resolve overlap | Synthesis plan |
| [skill-design](.agents/skills/skill-design/SKILL.md) | Decide the skill's boundary and interface | Design brief |
| [skill-evaluator](.agents/skills/skill-evaluator/SKILL.md) | Assess behavior against frozen cases and a baseline | Evaluation report |
| [skill-naming](.agents/skills/skill-naming/SKILL.md) | Choose a domain-first name and check known collisions | Naming decision |

## Use the collection

Read the selected package's `SKILL.md` and provide your task and inputs. Each specialist can return its own output when installed alone. The creation pipeline uses `skill-authoring`, `skills-discovery`, `skills-synthesis`, `skill-design`, and `skill-evaluator`; add `skill-naming` when a name is unresolved. Use packages from an approved source revision. They may be installed in a project or globally; the source checkout and a common parent directory are not required. The same agent can perform the stages sequentially; subagents are optional. A missing required companion produces a clear handoff instead of a silent substitution with another package of the same name.

For installed use, resolve resources from the host-reported skill location and choose a writable output workspace. Follow the bundled [helper guide](.agents/skills/skill-authoring/references/tooling.md) for explicit path examples. The repository commands below maintain this source checkout and are not prerequisites supplied by an installed package.

Example request:

> Use this collection's skill-authoring to build an English skill for preparing a GitHub issue from a bug report. Keep it focused on the issue artifact. Discover relevant sources, compare useful contributions, include LICENSE and provenance, and evaluate positive, negative, and unsafe-input cases. Write only to the selected local workspace.

The skills use the portable [Agent Skills format](https://agentskills.io/specification). Optional metadata describes authorship, tags, provenance, and reasoning preferences. A reasoning hint is explained in the skill body and does not switch models or configure runtime effort. The [runtime reference](.agents/skills/skill-authoring/references/runtime-guidance.md) distinguishes native fields from portable guidance; [compatibility](docs/compatibility.md) records actual coverage and limitations.

Packages live in `.agents/skills`, so compatible project agents can use the same skills that this repository maintains. `.github/skills` and `.claude/skills` are relative symlinks to that canonical directory; `CLAUDE.md` points to `AGENTS.md`. Other documented hosts that already discover `.agents/skills` need no duplicate tree. Optional `agents/openai.yaml` and original SVG icons provide Codex UI metadata without changing the core.

## Tooling in a source checkout

Local tooling uses Node.js 22+ built-ins, with no dependency installation or API credential. From the repository root:

```sh
mkdir -p .work
node .agents/skills/skill-authoring/scripts/skill_tools.mjs init example-skill --output .work
node .agents/skills/skill-authoring/scripts/skill_tools.mjs validate-skill .work/example-skill
node .agents/skills/skill-authoring/scripts/skill_tools.mjs validate-run .agents/skills/skill-authoring/examples/merge-run/run.json
npm run check
```

The initializer creates a licensed scaffold; an agent still authors and evaluates the skill. The custom checks assess structure and evidence integrity, not model quality or licensing compatibility. [Tooling documentation](.agents/skills/skill-authoring/references/tooling.md) covers supported inputs, bounds, and errors. Manual inspection can continue where the optional helper is unavailable.

Every new or modified skill also requires the official **`skills-ref validate`** check. The [GitHub workflow](docs/validation.md) runs the pinned official tool on every canonical skill in every PR. Python is a workflow dependency for that external tool only; contributors use Node.js locally. A missing or failed official check blocks readiness.

Add `--with-openai` when creating a scaffold to include the optional Codex interface and local icon. Repository checks use a small layered architecture in `src/`; the standalone skill helper remains inside its package. [package.json](package.json) centralizes commands and the official tool's pins. There is no repository requirements file or owned Python implementation.

## Provenance and maintenance

The [research ledger](docs/upstream-research.md) compares the cited skills.sh candidates and relevant alternatives at immutable revisions. [upstreams.lock.json](upstreams.lock.json) records source package and file SHA-256 values, licenses, and consumers for future upstream comparisons. It is benchmark evidence, not an installation lock or an automated updater. Popularity and a source hash do not certify production quality.

All six skills are `pilot` in [catalog.json](catalog.json). The [pilot report](docs/pilot-evaluation.md) records the initial synthetic creation exercise and its evaluation limits; it does not establish behavioral coverage for later additions. Review, behavioral evaluation, provider testing, consumer migration, releases, and public distribution remain distinct states. This change does not change repository visibility or install skills into consumers.

## Contribute

Start with [AGENTS.md](AGENTS.md), [authoring standards](docs/authoring-standards.md), and [architecture](docs/architecture.md). Prefer narrowly scoped skills over platform-wide bundles; related skills coordinate through explicit interfaces. Keep executable helpers tested, sources traceable, and examples synthetic. Run the checks above and submit a focused English pull request.

Original content is licensed under [Apache-2.0](LICENSE). Every distributed skill includes `LICENSE`; any future copied third-party material must retain its own required rights, notices, and attribution. Read [SECURITY.md](SECURITY.md) before handling external source packages or reporting a vulnerability.
