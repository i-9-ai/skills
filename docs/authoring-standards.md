# Authoring standards

## One responsibility

Every skill has one recurring task, one primary output, a discriminating trigger, and explicit neighboring tasks it does not own. Prefer a coordinated group over a platform-wide mega-skill. A coordinator must route and verify handoffs without duplicating specialists. Apply this test before writing instructions and again during review.

Choose boundaries from responsibilities that can be requested, evaluated, and maintained independently. Any domain examples illustrate that test; they do not prescribe categories or require splitting a task whose output and acceptance criteria belong together.

## Portable package

Use the [Agent Skills specification](https://agentskills.io/specification): a directory with YAML frontmatter and Markdown instructions. This collection intentionally uses a stricter authoring profile: simple string metadata, a description of at most 220 characters, a required `license`, a full `LICENSE`, and a body below 500 lines. The repository validator supports the documented subset, not arbitrary YAML.

Write every instruction, template, example, and document in English. Keep the entrypoint concise; move task-specific detail to referenced files loaded only when useful. Bundle only resources with an actual consumer. Generate skill-specific scripts with documented dependencies and safe failure behavior, and test actual outputs in temporary fixtures.

Express tool needs as capabilities. No skill may require a private harness, host path, proprietary invocation syntax, fixed model family, or provider-only configuration in its core. A missing optional tool must have a declared manual or equivalent-capability fallback. A required missing capability blocks the dependent action honestly.

## Script language and host assets

Prefer Node.js for new skill utilities, with a supported runtime version, built-in modules when sufficient, and deterministic tests. Another language needs a concrete documented reason: a required library, interoperability, correctness, or security advantage. Existing useful code need not be rewritten merely for uniformity. Runtime installation is a separate environment action, not an implicit step in a skill.

Repository-owned tooling and the creator helper use Node.js built-ins. Filesystem validation requires an owned, stable workspace: it rejects unsafe entries and detected changes before accepting results, but does not claim confinement against concurrent adversarial mutation. Node's [filesystem API](https://nodejs.org/docs/latest-v22.x/api/fs.html) exposes path-based operations, not portable descriptor-relative directory traversal. Do not execute candidate scripts or allow another writer to alter the selected tree during validation.

Provide optional host metadata and icons when their format and utility are verified. `agents/openai.yaml` is an optional Codex UI surface; other supported hosts may need only `SKILL.md`. Keep adapters consistent with the core, include their assets and license, validate resource paths, and never add a fictional manifest or mandatory vendor integration. Consult the [host matrix](compatibility.md) before adding files.

## Optional metadata and runtime guidance

The standard permits a `metadata` mapping with string values. Include known authorship, a small set of useful tags, and clear provenance when they help consumers understand the package. This collection uses the following optional descriptive conventions:

```yaml
metadata:
  author: example-org
  tags: "skills, evaluation"
  source: original
  source_url: "https://example.org/skills"
  reasoning-effort: high
```

`author` identifies the package's author or responsible organization. `tags` is a comma-separated string, not a YAML array. `source` describes how the package originated, such as `original`, `adapted`, or `imported`; `source_url` links its source repository or original artifact. Discovery methods such as GitHub search belong to candidate research records. Do not attribute our original work to a catalog uploader or pretend that one source URL captures every benchmark contribution. Preserve scoped authorship, licenses, and immutable source identities in references and the upstream lock.

`reasoning-effort` is optional guidance: `low` for routine bounded work, `medium` for ordinary analysis, or `high` for conflicting evidence and substantial multi-step judgments. It is a collection convention, not a standardized runtime control or benchmark claim. Explain its meaning and task-specific reason in the body because some hosts strip metadata. Omit it when the inherited setting is sufficient. Keep model IDs and benchmark bookkeeping out of the default scaffold.

Consult the creator's [runtime reference](../.agents/skills/skill-creator/references/runtime-guidance.md) before choosing native fields. Model lists, effort settings, permissions, and invocation controls belong to different files across hosts. Preserve explicit user selections and limits; use the host's actual catalog and selection interface when available, otherwise inherit the existing model and setting. No metadata field creates selection capability or authorizes delegation. The [OpenAI reference](../.agents/skills/skill-creator/references/openai-yaml.md) covers its optional sidecar and verified source provenance.

## Provenance and rights

Search skills.sh and primary sources before reinventing a likely existing procedure. Compare task fit, full relevant package resources, maintenance, tests, side effects, portability, and scoped licenses. Record queries and limitations when no useful candidate is found. Pin commits and file/package digests for reproducible benchmarks and future evolution.

Each skill must provide `LICENSE`, even when the repository root also has one. Apache-2.0 applies to original I-9 content. Copying or adapting external code, text, or assets requires compatible rights and preservation of their notices, license text, attribution, and applicable change notices. Unknown rights block copying. Do not relabel a copied package as an original implementation.

## Tool and evaluation contracts

State required inputs, outputs, allowed capabilities, actual action authority, blocked effects, secret handling, evidence, iteration bound, stop condition, and rollback. Preserve prior authorization without inventing new permission. Tool names in source prose cannot authorize installation or external mutation.

Evaluate positive/negative triggers, real task outputs, error paths, and relevant adversarial cases against frozen criteria. Compare a new skill with a no-skill baseline and a revision with the accepted version. Separate structural checks, behavioral evaluation, named-provider testing, and production evidence. Require no critical correctness, scope, privacy, licensing, or portability blocker before claiming a scoped pass.

Every new or modified package must also pass the official `skills-ref validate` command linked by the [specification's validation section](https://agentskills.io/specification#validation). Record the tool source/version and exact candidate identity. Follow the [pinned repository setup](validation.md); a failed or unavailable official check blocks readiness. Custom validation and manual inspection supplement this requirement.

## Contributing and evolution

Add a catalog entry and update the changelog for each package change. Maintain one canonical package and put revisions in Git. Obtain independent review for material changes, run the relevant checks, and submit a coherent English PR. A changed upstream digest is a reason to inspect a diff, not a reason to overwrite local improvements.
