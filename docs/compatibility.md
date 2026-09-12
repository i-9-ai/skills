# Compatibility and evidence

## Portable core

The packages use English Markdown, standard Agent Skills frontmatter, relative resources, plain file handoffs, and semantic tool capabilities. No proprietary SDK, provider configuration, agent home path, or subagent interface is required. Optional descriptive metadata and reasoning hints can be ignored without changing the task contract. Optional UI metadata and icons are bundled separately from the procedure.

| Surface | Intended support | Evidence boundary |
| --- | --- | --- |
| Agent Skills compatible hosts | Any host able to read the package and provide the needed capabilities | Format conformance does not prove behavior on every host |
| Sequential execution | One agent performs each companion skill and returns artifacts | Reference workflow; no delegation API needed |
| Delegated execution | Optional isolated workers with the same artifact contract | Host adapter is outside this collection |
| Text-only/manual execution | Local procedures and manual checks | Official conformance still requires execution; unavailable required checks block readiness |
| Local helpers | Node.js 22+ built-ins on an owned, stable workspace | Automated regressions cover exercised environments; no concurrent-adversary confinement claim |
| Installed package relocation | Bundled resources independent of this checkout and the calling directory; caller-selected outputs | Disposable project/global layouts and directory aliases are exercised by [distribution tests](../tests/distribution.test.mjs); no real consumer installation or universal host-runtime claim |
| Hosts without helper support | Portable prose and manual checks | Unsupported filesystem primitives fail explicitly; official validation can return through CI |

## Host integration research

Primary documentation was inspected on 2026-09-12. This table records documented loading conventions, not execution tests in every agent. Each runtime still controls workspace trust, tools, model choice, and installation. No global agent directory is modified by this repository.

| Host | Documented core and useful integration | Repository support |
| --- | --- | --- |
| Codex | Reads repository `.agents/skills`; optional `agents/openai.yaml` supports interface metadata and icon paths. [Official guide](https://learn.chatgpt.com/docs/build-skills) | Native canonical tree; per-skill interface metadata and original SVG icon |
| Claude Code | Reads `SKILL.md` and local resources under its skill directories; provider-specific frontmatter includes model and invocation controls. [Official guide](https://code.claude.com/docs/en/skills) | `.claude/skills` alias and `CLAUDE.md` alias; no required Claude-specific fields or hooks |
| GitHub Copilot | Supports skill directories and resources; VS Code adds invocation/frontmatter and extension-level capabilities. [GitHub overview](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills), [VS Code guide](https://code.visualstudio.com/docs/agent-customization/agent-skills) | `.github/skills` alias; no invented per-skill manifest or extension package |
| Antigravity | Current workspace location is `.agents/skills`; older `.agent/skills` remains a compatibility path. [Official guide](https://antigravity.google/docs/skills) | Native canonical tree; no duplicate legacy alias |
| OpenCode | Documents standard skill metadata and `.agents/skills` discovery; permission settings belong to host configuration. [Official guide](https://opencode.ai/docs/skills/) | Native canonical tree; no required `opencode.json` or permission change |
| Hermes | Reads `SKILL.md` and resources; supports extra platform and `metadata.hermes` fields. [Pinned authoring guide](https://github.com/NousResearch/hermes-agent/blob/d62716c7043e57ef7a29e81a02ddbc19334e29df/website/docs/developer-guide/creating-skills.md) | Portable packages available to its authorized loader; no unverified project-autoload claim or global symlink |
| pi | Reads project `.agents/skills` after project trust; package-level `pi.skills` is optional. [Pinned skills guide](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/docs/skills.md) | Native canonical tree; no npm package/installer required |

No documented per-skill `claude.yaml`, `copilot.yaml`, `hermes.yaml`, or similar sidecar was found. Nested `metadata.hermes` is outside the standard's flat string-map profile, and host hooks or permission settings can execute behavior; neither is silently added to the universal core. Useful future adapters must cite the runtime format they actually target. The [runtime-field comparison](../.agents/skills/skill-authoring/references/runtime-guidance.md) distinguishes Claude skill fields, Codex subagent configuration, Copilot CLI and VS Code, OpenCode V1/V2, and the remaining reviewed hosts.

The three repository symlinks are exact relative aliases: `CLAUDE.md` → `AGENTS.md`, `.claude/skills` → `../.agents/skills`, and `.github/skills` → `../.agents/skills`. Validation does not traverse or count them as a second package tree. Use the canonical path with the strict package helper. Git preserves these aliases; environments that disable symlink checkout must use the canonical tree through their documented loader and must not treat a link's text as a duplicate skill.

Skills CLI `1.5.26` was exercised locally with `skills add . --list` against the final six-package layout, with telemetry disabled. It found each canonical name once and exited without installing packages or creating an installation lock. This checks discovery, while detached-package tests cover bundled resources and helper execution separately; neither establishes an actual consumer installation. The [pinned discovery source](https://github.com/vercel-labs/skills/blob/d667282815248da03a08a18272b5d2eef9caf77c/src/skills.ts) explicitly lists `.agents/skills`; its recursive discovery is bounded rather than an unrestricted scan of every file.

## Evidence levels

- Structural checks validate package metadata, license presence, references, source lock consistency, catalog agreement, and basic public hygiene.
- Official `skills-ref validate` must pass on each new or changed package; the [pinned setup and PR workflow](validation.md) make this a separate required check.
- Run checks validate stage order, source constraints, bounded regular-file reads, and artifact hashes. They do not grade the truth of reports.
- Synthetic regression tests exercise concrete tool and failure behavior in disposable directories.
- Behavioral evaluation inspects decisions and artifacts for frozen task cases. The report must state executor, candidate, baseline, independence, limitations, and sample count.
- Named-provider and production compatibility require actual recorded execution on those systems. The initial catalog makes neither a universal model-quality claim nor a production approval claim.

Optional reasoning-effort recommendations are explained in each skill body and do not select models or apply host settings. They are not benchmark claims. An execution environment supporting the file format may still differ in model behavior, available tools, context budget, or permissions. Record those differences rather than hiding them behind a compatibility label. The [OpenAI sidecar reference](../.agents/skills/skill-authoring/references/openai-yaml.md) separates verified host fields from collection authoring conventions.

The [initial pilot report](pilot-evaluation.md) records the six-stage synthetic creation exercise, actual output observations, official validation, and the limits of its same-session manual baseline.
