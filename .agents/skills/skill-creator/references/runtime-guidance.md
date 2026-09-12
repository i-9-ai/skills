# Runtime fields and portable guidance

Read this when a skill needs invocation controls, model or reasoning preferences, tool declarations, or an optional host integration. Documentation was checked on 2026-09-12. These are documented interfaces, not execution tests across all hosts.

## Portable fields

The [Agent Skills specification](https://agentskills.io/specification#frontmatter) defines `name`, `description`, `license`, `compatibility`, `metadata`, and experimental `allowed-tools`. Use `compatibility` only for concrete environment requirements. `metadata` is a string-to-string map; it stores information without defining runtime behavior.

The pinned [official validator](https://github.com/agentskills/agentskills/blob/69ef37e9424c0a7ea9dd2293b559e43ec8176379/skills-ref/src/skills_ref/validator.py) rejects additional top-level fields. A field supported by a particular host, such as `model` or `effort`, is therefore not automatically valid in this collection's canonical `SKILL.md`. Putting the same name under `metadata` does not activate the host's top-level behavior.

Keep canonical packages valid under the official tool. Host-specific settings belong in a documented optional integration or a separately reviewed consumer configuration. Never invent a per-skill sidecar name, silently modify the user's agent configuration, or weaken official validation to accept an extension.

## Documented host behavior

| Host / surface | Useful skill fields or integration | Model and effort selection |
| --- | --- | --- |
| Codex | `name` and `description`; `agents/openai.yaml` supplies `interface`, `policy.allow_implicit_invocation`, and MCP `dependencies.tools`. The policy controls automatic skill invocation, not tool authorization. [Skills](https://learn.chatgpt.com/docs/build-skills#optional-metadata) | `model` and `model_reasoning_effort` are agent/subagent settings. No equivalent per-skill model selector was documented. Resolution considers explicit spawn choices, `[agents]` defaults, inheritance, and custom-agent overrides; consult the documented precedence and model-only effort behavior. [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents#custom-agents) |
| Claude Code CLI | Skill extensions include `argument-hint`, invocation flags, `allowed-tools`, `disallowed-tools`, `context`, `agent`, and `hooks`. Hooks can execute commands. [Skills](https://code.claude.com/docs/en/skills#frontmatter-reference) | `model` accepts one supported model value or `inherit`; `effort` sets relative reasoning effort. An inline override lasts for the invoking turn; with `context: fork`, the model applies to the subagent. Neither is a portable core field. |
| Copilot in VS Code | Skills document `argument-hint`, `user-invocable`, and `disable-model-invocation`. This table does not infer CLI tool permissions for the editor. [Skills](https://code.visualstudio.com/docs/agent-customization/agent-skills#header-required) | A custom `.agent.md`, not `SKILL.md`, accepts `model` as one model or an ordered list; the first available entry is used. `tools` and `handoffs.model` also belong to custom agents. [Custom agents](https://code.visualstudio.com/docs/agent-customization/custom-agents) |
| Copilot CLI | Skills document invocation flags, `argument-hint`, and `allowed-tools` as a comma-separated string or YAML array. [CLI reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference#skill-frontmatter-fields) | That skill-field table does not document a model selector. Do not transfer the VS Code custom-agent contract to CLI skills. |
| OpenCode V1 | Recognizes `name`, `description`, `license`, `compatibility`, and flat `metadata`; ignores unknown fields. [Skills](https://opencode.ai/docs/skills/#write-frontmatter) | Model and permission settings belong to the agent configuration. [Agents](https://opencode.ai/docs/agents/#model) |
| OpenCode V2 | Adds `slash` and `metadata.opencode/slash` / `metadata.opencode/autoinvoke`. Use quoted string values under portable `metadata`. Its loader injects the body without frontmatter, so essential guidance must also be in the body. Hiding a skill is not an execution deny rule. [V2 skills](https://opencode.ai/v2/docs/skills#frontmatter) | Agent `model` uses `provider/model` with an optional variant. A subagent inherits when unconfigured; selecting a primary agent does not change a session's stored model. [V2 agents](https://opencode.ai/v2/docs/agents#model) |
| Antigravity | Documents skill `name` and `description`, with resources loaded as needed. [Skills](https://www.antigravity.google/docs/ide/skills/#frontmatter-fields) | The reviewed skill guide does not establish per-skill model, effort, or tool-approval fields. |
| Hermes | Documents `platforms` and nested `metadata.hermes` activation conditions such as `requires_tools` and `requires_toolsets`. These conditions affect visibility; nested metadata is outside the portable flat-string profile. [Authoring](https://hermes-agent.nousresearch.com/docs/developer-guide/creating-skills/) | The reviewed skill guide does not establish a portable model selector. Platform, environment, and configuration extensions require a deliberate Hermes integration. |
| pi | The pinned guide documents `disable-model-invocation` plus standard fields, including experimental `allowed-tools`. A documented field name alone does not establish enforcement. [Skills](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/docs/skills.md#frontmatter) | No per-skill model selector is documented in that guide. Keep host/model control separate from skill-loading support. |

## Tools and permissions

`allowed-tools` has runtime-specific consequences. In Claude Code CLI it pre-approves listed tools for the invoking turn; it does not make them the only callable tools. Unlisted tools retain ordinary permission handling. Claude's `disallowed-tools` removes tools from the active pool. The [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/skills#pre-approve-tools-for-skills) also applies `allowed-tools` for project and personal skills. Application options `allowedTools` / `allowed_tools` provide another preapproval mechanism, not an exclusive allowlist; the session's permission flow still applies. Skills synced from claude.ai follow separate frontmatter rules.

Copilot CLI also documents automatic allowance. Tool names, command patterns, separators, trust rules, and lifetimes differ by host. Avoid broad grants such as all tools or unrestricted shell execution. Do not add approval-changing fields to a general-purpose package solely because the field exists.

Codex command rules use `prefix_rule` with `allow`, `prompt`, or `forbidden` in trusted configuration layers, not skill frontmatter. [Rules](https://learn.chatgpt.com/docs/agent-configuration/rules) OpenCode V2 uses ordered action/resource rules; V1 has a different configuration shape. [V2 permissions](https://opencode.ai/v2/docs/permissions)

For a portable skill, describe required capabilities, permitted effects, concrete command examples, and stopping conditions in prose. These instructions complement the host's enforcement; they cannot grant access, bypass a sandbox, or authorize an external action on the user's behalf.

## Model preferences and fallback

No common skill field was found that asks every host to choose the most suitable model from its catalog. Separate a capability recommendation, a concrete model preference, and an actual host setting.

For an authorized new execution or delegated task where model selection is exposed:

1. Preserve explicit user choices and resource limits. Identify required modalities, tool support, context capacity, and the task's reasoning needs.
2. Inspect the host's actual available-model catalog or documented options. Do not guess identifiers, credentials, availability, or capabilities from a brand name.
3. If a user supplied an ordered preference list, choose the first available entry that meets the task requirements and limits. Match the host's real identifiers; an `openai/...` identifier is not necessarily the name another host accepts.
4. If no preferred entry qualifies, inherit the current model when capable. Report a concrete capability gap if the task cannot proceed. Do not silently substitute an unavailable model or change the existing session's selection.
5. Apply settings through the host's supported execution interface. Record what was actually selected in the run or evaluation report when it matters; do not maintain an unmeasured benchmark-status field in every skill.

Without an exposed catalog and selection interface, retain the current model and use the capability guidance as instructions. A skill cannot switch its already running model merely by declaring a preference. Model selection support does not itself authorize delegation or extra external effects.

## Reasoning effort

`low`, `medium`, and `high` appear in both Claude's skill `effort` options and Codex's agent `model_reasoning_effort` options. They are relative settings, not equal token budgets, guaranteed reasoning depth, model-quality scores, or permissions. Availability still depends on the selected model.

An explicit high-effort preference maps to `effort: high` in a Claude-specific skill and `model_reasoning_effort = "high"` in a Codex agent configuration. Those declarations belong in different files and do not form a portable two-field `SKILL.md` contract. Unsupported effort settings should retain the inherited setting rather than produce a false claim that the runtime changed.

Use higher effort for decisions requiring comparison of conflicting evidence or substantial multi-step reasoning. Prefer the existing setting for routine work unless a task-specific need justifies a change. Keep any recommendation and its meaning visible in the skill body: some loaders discard custom metadata before invoking the model.

This collection permits one optional shorthand, `metadata.reasoning-effort`, with string values `low` (routine bounded work), `medium` (ordinary analysis), or `high` (conflicting evidence or substantial multi-step judgments). It is a descriptive convention, not a field that hosts are claimed to interpret natively. Omit it when it adds no task-specific guidance. Its body explanation and the selection conditions above are essential; a declared hint is never evidence that a native effort setting was applied.
