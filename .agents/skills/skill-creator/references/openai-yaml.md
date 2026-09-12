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

Quote string values, keep keys unquoted, use a 25–64-character short description, and mention the exact `$skill-name` in `default_prompt`. These are conventions from the reviewed creator reference and this collection's validation contract; quoting keys or leaving some strings unquoted is not inherently invalid YAML. Do not present every authoring convention as a universal runtime requirement.

The local helper supports a deliberately bounded YAML subset: `interface` first, then optional `dependencies` and `policy` in either order. It checks known scalar fields, duplicate keys/sections/dependency IDs, booleans, six-digit colors, and existing regular icon files beneath `./assets/`. It supports at most 16 remote MCP entries using `streamable_http`, with HTTPS URLs without credentials, query parameters, or fragments. Other transport or YAML forms need a deliberate validator extension and primary-source verification.

Validation reads files only. It never connects to a URL, installs or invokes a dependency, edits host settings, changes invocation policy, or selects a model. Metadata validity and actual host integration tests are different evidence. See [tooling](tooling.md) for filesystem limits and [runtime guidance](runtime-guidance.md) for provider differences.

## Secondary-source verification

The user-supplied [Metaflow listing](https://metaflow.life/skills/skills-openai-yaml) was reviewed on 2026-09-12. Its advertised preview led to account creation, so that installed artifact was not inspected or installed. Its `title`, `slug`, tags, discovery source, and attribution describe a catalog record; they are not the canonical Agent Skills header. The source URL used `main`, but the accessible repository's default branch was `master`.

The [referenced document at an immutable commit](https://github.com/kursku/skills/blob/346c313fd2ec241a088c68274da26c538422568b/.system/skill-creator/references/openai_yaml.md) matches the OpenAI creator reference available during review. Its containing package includes [Apache-2.0 license text](https://github.com/kursku/skills/blob/346c313fd2ec241a088c68274da26c538422568b/.system/skill-creator/license.txt). This was a two-file reference inspection, not qualification of the entire upstream skill collection.

- Document SHA-256: `ffac39318e408108141d40f820968e59f70434a891694f9bf1d25be8237b150c`.
- License SHA-256: `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`.

This reference restates verified interface facts with an original synthetic example. It does not adopt the listing's marketing-specific framing, establish Metaflow runtime support, or attribute this collection's original skills to the catalog uploader. The official documentation remains the authority for OpenAI behavior.
