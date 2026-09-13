# Authoring a portable package

## Responsibility first

Write a one-sentence contract: given these inputs, produce this output for this recurring task. List near-miss requests belonging elsewhere. If two outputs can be requested, verified, and maintained independently, split them into companion skills. An orchestrator describes routing and shared handoffs, not a second copy of every procedure.

Choose a domain-first name that reveals the responsibility. Use `skill` for one target skill and `skills` when several source skills or a candidate set are central. For another domain, use its own affinity prefix, such as `github-issue`; the examples are not a mandatory taxonomy. A naming decision supplied by the caller or `skill-naming` should record relevant collisions and constraints. Preserve external benchmark names during a local rename.

## Package contents

- `SKILL.md`: required YAML `name` matching the directory, a discriminating `description` under 220 characters, and concise English instructions. Describe both what the skill does and when it applies. Keep the body under 500 lines and normally much shorter.
- `LICENSE`: required full license text for the original work; include third-party licenses and notices at their required scopes. Do not treat the root repository license as a substitute when a skill is distributed alone.
- `references/`: decision-changing detail, schemas, and documented provenance loaded only for relevant cases. Link the resources from the entrypoint or another reachable reference.
- `scripts/`: deterministic helpers only when they remove repeated, fragile work. Describe inputs, dependencies, outputs, side effects, failure codes, and safe invocation. Test them on disposable fixtures.
- `assets/`: templates or files consumed by the output. Remove unused scaffold placeholders from the final package.
- `examples/`: a small number of complete synthetic examples showing observable behavior, boundary handling, or a real output contract.

Avoid mandatory provider-specific folders, runtime configuration, absolute local paths, and implicit platform commands in the core. A skill may require a domain capability such as reading an issue or editing a file; state that capability and its fallback. Explain unavailable execution honestly instead of fabricating a tool call.

## Installed use and resource boundaries

Treat the installed package, the caller's project, and the output/run workspace as separate locations. Resolve bundled references, templates, and helper modules from the loaded `SKILL.md` or script location. Select writable outputs from the caller's task; never assume the current directory is the skill directory or write scratch into an installation by default.

Bundle every local dependency needed by the skill. Do not require the source collection's root instructions, catalog, scripts, package-manager commands, benchmark lock, or CI configuration. If the task needs a command from the caller's project, first verify that project's actual configuration and the command's role. Companion skills are separate dependencies: declare the needed capability, locate a trusted installed package, and report an unavailable handoff without assuming a sibling directory.

Before accepting a package, copy it alone outside its source checkout. Check its resources and exercise documented helpers from an unrelated working directory with separate writable outputs. Cover installed directory aliases when supported and verify that the installation remains unchanged. Keep collection maintenance rules in the collection's documentation, outside the distributed skill.

## Script language and optional host metadata

Use JavaScript with Node.js built-ins for small zero-dependency utilities: declare the supported version and provide deterministic tests. Choose TypeScript or another language only for a specific maintenance, library, interoperability, correctness, or security advantage; document that reason, runtime verification, and runnable distribution path. Do not require a consumer to infer a compiler bootstrap or add a Node wrapper solely to conceal another dependency.

When preparation is required, add `metadata.setup` pointing to an existing bundled `scripts/` file and state the prerequisites in `compatibility`. The `SKILL.md` must include `Prerequisites and setup` subsections for explicit setup, idempotence and side effects, and fallback. Setup is never automatic on installation or activation. Keep lengthy setup rationale in `references/setup.md`; do not add a top-level installation guide.

This package's helper uses Node.js built-ins. It operates on owned workspaces that remain stable during validation, rejects unsafe entries and detected changes, and never executes candidate scripts. Its checks are not a sandbox against concurrent adversarial filesystem mutation. See the tooling guide for supported inputs and bounds.

An optional `agents/openai.yaml` may provide documented host `interface` fields. It is host UI data, not the procedural source of truth. Keep prompt and description consistent with `SKILL.md`. For collections that declare this interface profile, include `assets/icon.svg` for `icon_small` and a matching `assets/icon.png` for `icon_large`; both assets must be responsibility-specific. A copied scaffold icon is only a draft and must be replaced before acceptance. For portable packages outside such a collection, this adapter and both assets remain optional: do not make another host or a standalone installation depend on them. Use the helper's opt-in adapter flag when available, or the host's current documented format. For other hosts, verify their primary documentation before adding files; many consume `SKILL.md` directly and need no additional per-skill manifest. Do not invent adapters from product names or duplicate the core into multiple editable copies.

Metadata is optional. Use string-valued `author`, comma-separated `tags`, `source`, and `source_url` when they accurately describe the package. Keep discovery methods and multi-source contributions in provenance records; do not confuse a catalog uploader with the original author. Never invent authorship, populate placeholder source URLs in final packages, or duplicate a catalog's `title` and `slug` as unsupported top-level skill fields.

If a task benefits from an effort recommendation, optional `metadata.reasoning-effort` may be `low`, `medium`, or `high`. Explain its meaning and rationale in the body; it neither chooses a model nor changes runtime effort. Do not require evidence-status metadata. Use the [runtime reference](runtime-guidance.md) for native model/effort fields, ordered model fallback, and tool authorization. Use the [OpenAI interface reference](openai-yaml.md) for verified sidecar fields and limits. Keep defaults provider-free and preserve existing user choices.

## Provenance and evolution

For each reused source, retain its repository, package path, immutable revision, scoped license, reviewed inventory, and useful contribution. Preserve per-file SHA-256 and an aggregate package hash when benchmarking for future comparison. A newer upstream hash means content changed; it does not mean an improvement should be adopted.

Record the decision for each meaningful component: retain, adapt, replace, reject, or reference. When copying or adapting protected text, code, or assets, preserve their required attribution, licenses, and change notices. Independently written implementations should say they reuse ideas rather than claiming to vendor the upstream package.

## Required validation and supplemental manual checks

Validate every new or modified package with the official `skills-ref validate` tool. Follow the [official validation contract](validation.md), record the candidate and tool identities, and repeat after package changes. If official execution is unavailable or fails, preserve the draft and block readiness. The following manual checks supplement official validation and can replace only the optional custom helper.

1. Verify the directory/name, required fields, `LICENSE`, and every resource link.
2. Inspect the package tree for symlinks, hidden state, unsafe paths, credentials, private data, and unrelated files before reading or copying resources.
3. Check the one-responsibility boundary and that instructions preserve scope, permission, known user choices, stopping behavior, and rollback.
4. Exercise each safe documented helper or record why it was not run. Inspect returned artifacts rather than trusting exit status alone.
5. Obtain behavioral evaluation of positive, negative, functional, and adversarial cases. Report the tested environment and any untested runtime.

Structural validation cannot establish that English prose is useful, license rights are compatible, an example is anonymized, or an agent made the correct decision. Those checks remain explicit review responsibilities.
