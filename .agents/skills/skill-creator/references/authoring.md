# Authoring a portable package

## Responsibility first

Write a one-sentence contract: given these inputs, produce this output for this recurring task. List near-miss requests belonging elsewhere. If two outputs can be requested, verified, and maintained independently, split them into companion skills. An orchestrator describes routing and shared handoffs, not a second copy of every procedure.

## Package contents

- `SKILL.md`: required YAML `name` matching the directory, a discriminating `description` under 220 characters, and concise English instructions. Describe both what the skill does and when it applies. Keep the body under 500 lines and normally much shorter.
- `LICENSE`: required full license text for the original work; include third-party licenses and notices at their required scopes. Do not treat the root repository license as a substitute when a skill is distributed alone.
- `references/`: decision-changing detail, schemas, and documented provenance loaded only for relevant cases. Link the resources from the entrypoint or another reachable reference.
- `scripts/`: deterministic helpers only when they remove repeated, fragile work. Describe inputs, dependencies, outputs, side effects, failure codes, and safe invocation. Test them on disposable fixtures.
- `assets/`: templates or files consumed by the output. Remove unused scaffold placeholders from the final package.
- `examples/`: a small number of complete synthetic examples showing observable behavior, boundary handling, or a real output contract.

Avoid mandatory provider-specific folders, runtime configuration, absolute local paths, and implicit platform commands in the core. A skill may require a domain capability such as reading an issue or editing a file; state that capability and its fallback. Explain unavailable execution honestly instead of fabricating a tool call.

## Script language and optional host metadata

Prefer Node.js for new utilities: declare the supported version, use built-in modules when sufficient, avoid unnecessary package dependencies, and provide deterministic tests. Choose Python or another language only for a specific library, interoperability need, correctness property, or security primitive; document that reason and runtime verification. Do not add a Node wrapper around a Python helper solely to conceal the dependency.

This package's Python helper is an exception because its filesystem boundary uses descriptor-relative POSIX operations and no-follow flags to reject directory-symlink races without native dependencies. The test harness and repository validator reuse that boundary. Its runtime limits are explicit in the tooling guide; the choice does not make Python the default for generated skills.

An optional `agents/openai.yaml` may provide the documented Codex `interface` fields and local `assets/icon.svg` paths. It is host UI data, not the procedural source of truth. Keep prompt and description consistent with `SKILL.md`. Use the helper's opt-in adapter flag when available, or the host's current documented format. For other hosts, verify their primary documentation before adding files; many consume `SKILL.md` directly and need no additional per-skill manifest. Do not invent adapters from product names or duplicate the core into multiple editable copies.

Every generated package includes advisory `metadata` model guidance: `i9-model-profile` (`balanced` or `deep-reasoning`), `i9-model-policy: advisory`, and `i9-model-evidence: unbenchmarked` until there is measured evidence. These collection conventions are hints, not automatic runtime settings. Concrete model suggestions need dated task-specific evidence, a local reference, and an available-model fallback.

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
