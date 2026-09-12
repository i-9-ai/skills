# OpenAI skill interface and invocation metadata

Read this when creating or changing an optional `agents/openai.yaml`. The file is configuration consumed by the host, separate from the portable procedure in `SKILL.md`. Keep required instructions in the skill body and include a fallback for any optional integration.

## Fields confirmed against the primary reference

The [official skills guide](https://learn.chatgpt.com/docs/build-skills#optional-metadata) documents these sections:

| Section / field | Purpose |
| --- | --- |
| `interface.display_name` | Human-facing skill title |
| `interface.short_description` | Compact UI summary |
| `interface.icon_small`, `interface.icon_large` | Paths to bundled icon assets |
| `interface.brand_color` | Hex color used for presentation |
| `interface.default_prompt` | Suggested starting prompt for invoking the skill |
| `policy.allow_implicit_invocation` | Whether the host may automatically invoke the skill; omitted means `true`, and `false` preserves explicit invocation |
| `dependencies.tools` | List of tool dependencies; the reviewed reference documents MCP entries with `type`, `value`, `description`, `transport`, and `url` |

A declaration does not prove that a dependency is installed, connected, authenticated, available, or authorized. Check those conditions at execution time. Invocation policy neither selects a model nor grants tools. Do not infer undocumented per-skill model or effort settings from this file.

## Example

This example illustrates the optional fields. Replace its synthetic dependency with a verified, needed integration before using it; `example.org` is not a service to connect to.

```yaml
interface:
  display_name: "Example Skill"
  short_description: "Produce a focused and verifiable result"
  icon_small: "./assets/icon.svg"
  icon_large: "./assets/icon.svg"
  brand_color: "#3B82F6"
  default_prompt: "Use $example-skill to produce the requested result."

dependencies:
  tools:
    - type: "mcp"
      value: "example-tool"
      description: "Synthetic dependency for this example"
      transport: "streamable_http"
      url: "https://example.org/mcp"

policy:
  allow_implicit_invocation: true
```

Include only fields that improve the actual skill. The default scaffold adds UI fields and a local icon only when `--with-openai` is requested. It does not add MCP dependencies, a model, a brand color, or an invocation override. Preserve existing dependency and policy settings when editing unrelated UI fields. Use explicit-only invocation only when the user requests that behavior.

## Authoring conventions and validation

Quote string values, keep keys unquoted, use a 25–64-character short description, and mention the exact `$skill-name` in `default_prompt`. These are conventions from the reviewed creator reference and the bundled helper's validation contract; quoting keys or leaving some strings unquoted is not inherently invalid YAML. Do not present every authoring convention as a universal runtime requirement.

The local helper supports a deliberately bounded YAML subset: `interface` first, then optional `dependencies` and `policy` in either order. It checks known scalar fields, duplicate keys/sections/dependency IDs, booleans, six-digit colors, and existing regular icon files beneath `./assets/`. It supports at most 16 remote MCP entries using `streamable_http`, with HTTPS URLs without credentials, query parameters, or fragments. Other transport or YAML forms need a deliberate validator extension and primary-source verification.

Validation reads files only. It never connects to a URL, installs or invokes a dependency, edits host settings, changes invocation policy, or selects a model. Metadata validity and actual host integration tests are different evidence. See [tooling](tooling.md) for filesystem limits and [runtime guidance](runtime-guidance.md) for provider differences.
