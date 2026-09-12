# Deterministic tooling

The bundled `scripts/skill_tools.mjs` uses Node.js 22+ built-ins. Locate it relative to the loaded `SKILL.md`; it needs no checkout of the source repository, package manager, network, provider API, Python, or agent runtime.

Use an owned workspace that remains stable throughout the run. The filesystem checks reject unsafe entries and detected changes, but do not provide race-proof confinement against a concurrent adversary. Required no-follow primitives must be available; unsupported environments fail explicitly. An agent can perform manual inspection and record the same artifacts, but must not claim unexecuted checks passed. Platform coverage is limited to recorded test environments.

Do not execute source scripts or permit another writer to alter the selected tree while validating it. Node's path-based filesystem APIs do not expose portable directory-descriptor traversal. No native dependency or hidden runtime is added to conceal that limitation.

## Commands

Resolve `<installed-skill>` to this package's verified absolute directory, `<output-parent>` to an existing writable directory selected by the caller, and `<run-directory>` to the run's directory. Replace these placeholders before running the commands. Use output and run directories outside the installed package; its location may be shared, read-only, or unrelated to the current working directory.

```sh
node "<installed-skill>/scripts/skill_tools.mjs" init example-skill --output "<output-parent>"
node "<installed-skill>/scripts/skill_tools.mjs" init example-skill-ui --output "<output-parent>" --with-openai
node "<installed-skill>/scripts/skill_tools.mjs" validate-skill "<output-parent>/example-skill"
node "<installed-skill>/scripts/skill_tools.mjs" validate-run "<run-directory>/run.json"
```

Arguments may be relative to the calling shell's working directory, but absolute paths avoid confusing the installed package with the output project. If the host exposes an installer-created directory alias, verify that alias and use the actual trusted package directory for validation. The helper rejects a symlink selected as the validation root; this does not permit symlinks inside candidate packages or runs.

The destination parent must already exist. `init` exclusively creates a new directory and never overwrites an existing file, directory, or symlink. Names start with a lowercase letter, contain lowercase letters, digits, and single hyphens, and are at most 64 characters. It creates a draft `SKILL.md` with one responsibility and a boundary, plus an exact copy of this package's Apache-2.0 `LICENSE`. Resolve the draft's task-specific instructions and tests before use. The default license covers new original work; it cannot relicense material copied from other sources.

The default scaffold has no provider files. `--with-openai` adds optional `agents/openai.yaml` interface metadata and copies this package's original `assets/icon.svg`. The adapter contains display name, short description, a prompt mentioning the skill, and icon paths. It adds no model ID, runtime, credentials, or tool dependency; customize the generic display text and icon when useful.

Successful commands print a compact JSON result and exit zero. Validation failures print an error to standard error and exit one. Argument errors exit two. `validate-skill` and `validate-run` do not write files.

This helper complements the required official `skills-ref validate` conformance check; it does not replace it. A trusted workflow can provide the official result for the exact candidate without adding Python locally. See [official validation](validation.md), and retain this helper for local file checks, optional metadata, and handoff integrity.

## Skill checks

`validate-skill` requires a regular UTF-8 `SKILL.md` and nonempty regular UTF-8 `LICENSE`, checks that frontmatter name matches the directory, limits the description to 220 characters and `SKILL.md` to 500 lines, and checks local Markdown links throughout the package. Required fields support plain or quoted scalar strings and indented literal/folded blocks. Optional `metadata` supports a flat mapping of two-space-indented string values with duplicate-key rejection; other optional frontmatter is not interpreted. This is not a complete YAML parser.

No model or effort metadata is required. The scaffold emits none. If `metadata.reasoning-effort` appears, it must be `low`, `medium`, or `high`; its meaning belongs in the body. Other flat string metadata, including descriptive `author`, `tags`, `source`, `source_url`, and namespaced host keys such as `opencode/autoinvoke`, is preserved without runtime interpretation. Array or nested metadata remains outside this helper's portable profile.

The helper also reads standard scalar `compatibility` (1–500 characters) and `allowed-tools` declarations. It checks their string shape; it does not execute commands, grant tools, or validate host-specific permission patterns. Unsupported top-level extensions still require the official validator and host review.

When `agents/openai.yaml` exists, validation supports `interface` first, then optional `policy` and `dependencies` mappings. It checks the documented UI fields, optional six-digit `brand_color`, literal boolean `policy.allow_implicit_invocation`, and a bounded list of remote MCP dependencies. Icon paths must reference regular files under `./assets/`. Unknown fields, duplicate keys/sections/dependency IDs, and unsupported shapes fail. See the [OpenAI reference](openai-yaml.md) for the exact supported subset, authoring conventions, and source verification. Validation never invokes a dependency or changes an agent setting.

Ordinary Markdown inline links, images, and reference definitions are checked outside code fences and inline code. Relative links may reach sibling resources inside the package; they may not escape it. HTTP, HTTPS, and email links are not fetched. HTML links, escaped Markdown, generated references, anchors, semantic completeness, license compatibility, and command safety need review.

Packages reject symlinks, special files, more than 2,048 entries, nesting beyond 24 components, files above 4 MiB, and total files above 32 MiB. File reads also reject hard links. Markdown and license reads are bounded to 256 KiB. The selected root is trusted; component inspection, final no-follow opens, descriptor checks, and bounded reads reject unsafe entries and detected changes. These checks assume a stable tree and cannot eliminate every concurrent path race. The validator does not execute package scripts or inspect remote sources.

## Run protocol version 1

The JSON schema is in [run.schema.json](../assets/run.schema.json). A run manifest lives directly inside its run root. It contains only these fields:

- `schema_version`: integer `1`.
- `run_id` and `target_skill`: valid slugs.
- `goal`: a nonblank string.
- `status`: `draft`, `blocked`, or `validated`.
- `sources`: objects containing `id`, `uri`, `revision`, `license`, and `reuse`.
- `stages`: an ordered prefix of `intake`, `discovery`, `synthesis`, `design`, `authoring`, and `evaluation`.

Source IDs are unique. A URI is public HTTPS without credentials or query parameters, or a synthetic `urn:example:` identifier. Duplicate URI/revision pairs are rejected. `reuse` is `pattern`, `adapt`, `reference`, or `reject`. Adapted sources need a 40- or 64-character lowercase hexadecimal immutable revision and a declared license; the validator cannot determine whether the license actually permits reuse. `pattern` and `adapt` count as contributors, and two revisions of the same URI count only once.

Each stage contains only `name`, `status`, `summary`, and `artifacts`. Stage status is `passed`, `skipped`, or `blocked`; summaries are nonblank and explain decisions. Every passed stage needs at least one nonempty evidence artifact. Synthesis may pass only with at least two distinct contributing source URIs. With fewer contributors, synthesis may be skipped with a reason in its summary. No other stage may be skipped. A blocked stage terminates the stage list, and the run status must be `blocked`. A `validated` run has all six stages and passed evaluation; a skipped synthesis with a justified shortfall is allowed.

Artifacts contain only `path` and `sha256`. Paths are relative POSIX file paths under the run root, with no absolute paths, backslashes, empty components, `.` or `..`, or symlinks. Hashes are lowercase SHA-256 hex strings over the exact file bytes. The manifest cannot hash itself. Reusing an artifact in another stage is allowed only with the same digest. Evaluation artifacts must document the checks, observations, failures, and remaining limits required by the evaluator; the checker verifies their presence and bytes, not the truth of their contents.

Input is bounded to 1 MiB of UTF-8 JSON, 128 sources, six stages, 64 artifacts per stage, 4 MiB per artifact, and 32 MiB of unique artifact contents. Duplicate JSON fields, non-finite numbers, malformed schemas, unreadable files, and hash mismatches fail. JSON Schema expresses static shape; the Node validator also enforces ordering, source sufficiency, safe relative paths, and hashes.
