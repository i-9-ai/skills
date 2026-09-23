# Positioning and communication strategy

## Purpose

Present I-9 Skills as a practical framework for teams that need to create, repair, modularize, validate, and evolve agent skills without turning their collection into an opaque set of large prompts. This document guides public copy, demos, documentation, and launch material. It does not authorize publication or make performance claims.

## Core position

**Innovation does not require disruption. It starts with a better way to create value.**

I-9 Skills applies that idea to agent skills. A team does not need to replace its agents, toolchain, or existing skills to improve them. It can identify a narrow problem, preserve what already works, split mixed responsibilities, validate the smallest useful change, and keep an auditable path back to the prior version.

## Audience and job to be done

| Audience | Current friction | Promise we can substantiate |
| --- | --- | --- |
| Individual builder | A growing folder of inconsistent prompts and copied skills | A method for making one package focused, portable, and reviewable |
| Engineering or AI team | Multiple agents and skills with unclear ownership, drift, and uneven quality | A shared lifecycle with explicit outputs, handoffs, validation, and provenance |
| Team inheriting an existing collection | Large skills mix several jobs, lack resources, or contain unsafe material | A structured audit and refactoring path that preserves evidence and rollback options |
| Organization evaluating agent practices | Wants dependable reuse without locking into one vendor | An agent-agnostic package contract with optional host adapters |

The message is a method promise, not a promise of revenue, productivity, accuracy, or autonomous behavior. Any quantitative result requires an approved, attributable case study.

## Message hierarchy

### Headline

**Build agent skills that stay focused, portable, secure, and easier to improve over time.**

### Supporting statement

I-9 Skills turns a skill collection into a modular system: every package owns one responsibility, has one primary output, carries its license and resources, and can be evaluated or evolved without rewriting everything.

### Proof points

- **Modular by design:** discovery, design, authoring, evaluation, security, publication, installation, and evolution are separate packages with explicit handoffs.
- **Complete package contract:** each package includes a `SKILL.md`, its own Apache-2.0 license, required interface assets, and local resources.
- **Evidence-gated improvement:** weak signals remain hypotheses; supported changes preserve the baseline, validation evidence, and a rollback revision.
- **Portability first:** the core uses standard Agent Skills Markdown and local resources. Host-specific metadata remains optional.
- **Public-ready hygiene:** validation rejects missing or unsafe package structure and the project rules prohibit secrets, private paths, and customer material.

Use only proof points that are true for the displayed revision. Link to the package, catalog, validation contract, or public CI evidence where useful.

## Explain the framework in one minute

1. **Find the real job.** Discover existing approaches and define the smallest useful responsibility.
2. **Make the package complete.** Add the instructions, license, resources, metadata, and recognizable interface assets it needs.
3. **Prove it before promotion.** Evaluate behavior, security, compatibility, and lifecycle readiness at the same revision.
4. **Improve without starting over.** Audit an existing collection, preserve weak signals as hypotheses, and evolve only the smallest supported change.

The diagram in the [README](../README.md#from-idea-to-durable-skill-system) is the canonical concise visualization of this flow.

## Product story: modularization without disruption

Avoid framing the framework as a demand to rebuild a team's collection. The useful narrative is incremental:

> Start with the skill that causes the most rework. Separate its jobs, preserve the working parts, validate the new boundary, and repeat only where evidence justifies it.

This makes the framework useful for both a new collection and a mature, uneven one. The value is not the number of packages; it is clearer ownership, predictable inputs and outputs, safer changes, and an observable route from evidence to improvement.

## Icon and interface story

Treat interface assets as part of a complete package, not decoration. When a skill is authored or evolved, the collection checks for a source-attributed SVG small icon and matching PNG large icon. If an icon is missing, unsafe, duplicated, or no longer represents the skill's responsibility, `skill-icon-design` creates the correction before the package can pass collection validation.

This provides a visible signal of package completeness while keeping the actual procedure portable. Do not claim that every host renders icons the same way; the package remains usable when a host ignores optional UI metadata.

## Suggested content formats

| Format | Angle | Concrete evidence to show |
| --- | --- | --- |
| Landing-page section | “Improve the skills you already have” | The lifecycle diagram and a before/after package boundary |
| Short video or carousel | “A skill is a package, not a giant prompt” | `SKILL.md`, license, resources, validation, and interface assets |
| Technical article | “How to modularize an inherited skill collection” | Audit finding → refactoring plan → candidate validation → rollback path |
| Product demo | “From weak signal to supported change” | Evidence class, selected change, checks, and the retained baseline |
| Repository release note | “What changed and why” | Exact package revision, affected responsibility, validation evidence |

## Copy library

### Portuguese

- “Inovação não exige ruptura. Ela começa quando uma forma melhor de fazer gera mais valor.”
- “Melhore as skills que você já tem, sem recomeçar do zero.”
- “Uma responsabilidade por skill. Um resultado verificável por vez.”
- “Transforme prompts acumulados em pacotes claros, portáteis e evolutivos.”

### English

- “Innovation does not require disruption. It starts with a better way to create value.”
- “Improve the skills you already have without starting from zero.”
- “One responsibility per skill. One reviewable result at a time.”
- “Turn accumulated prompts into clear, portable, evolving packages.”

## Claims and safeguards

Do:

- describe the method and link to the public implementation;
- show a real before/after only with authorization and reproducible evidence;
- distinguish an observed result from a hypothesis or demonstration;
- state what a package or validation run actually covered.

Do not:

- promise revenue, cost reduction, quality, safety, or autonomy without approved evidence;
- invent customer stories, metrics, testimonials, or comparative claims;
- imply that a registry listing or download count proves quality or security;
- expose private source material, internal paths, credentials, or customer data in promotional examples.

## Review before public use

Before reusing this strategy in a site, release, talk, or social post, verify that the named packages and validations exist at the public revision. Route factual, security, and publication claims through the appropriate review process. The strategy can guide copy immediately; public publication remains a separate authorized action.
