---
name: skill-icon-design
description: Use to design or refresh a distinct, accessible SVG icon for one skill package from its responsibility and visual constraints. It does not redesign other package content.
license: Apache-2.0
metadata:
  author: i-9-ai
  tags: "skills, icons, visual-design"
  source: original
  source_url: "https://github.com/i-9-ai/skills"
  reasoning-effort: medium
---

# Skill Icon Design

## Responsibility and inputs

Produce one distinctive SVG icon for a skill package. Accept the skill's name, responsibility, existing icon set, interface constraints, and optional collection palette. Read the target `SKILL.md` to understand the skill before choosing a symbol.

Resolve this package's guidance from the loaded `SKILL.md`. Write the icon only to the caller-selected workspace. An image-generation provider is optional and cannot be assumed.

## Procedure

1. Extract the skill's primary action and output in a short phrase. Choose one concrete visual metaphor for that action.
2. Inspect sibling icons when available. Reject a metaphor, palette, silhouette, or path composition that is already used for another responsibility.
3. Consult the [visual source guide](references/icon-sources.md) for symbol vocabulary and licensing. Prefer a named, recognizable symbol from a compatible established library over inventing an ambiguous pictogram. Pin the source revision, record the icon name and preserve notices.
4. Draft a distinctive square SVG with a `64 64` view box, meaningful title, strong silhouette, high contrast, and no embedded text. Use background shape, depth, negative space, color, or a secondary motif when they improve recognition at small size.
5. Apply the [icon contract](references/icon-contract.md). Do not include scripts, external resources, remote fonts, raster data, metadata containing private prompts, or local paths.
6. Save the SVG in the target skill's `assets` directory and update an existing host interface only when the caller authorized that package edit. If a host benefits from PNG, render it from the reviewed SVG or use an authorized generative provider, then record the provider, prompt ownership, dimensions, and license disposition.
7. Validate XML structure, asset references, accessibility title, silhouette and color distinction, and byte-level uniqueness against sibling icons. Render or preview the icon when the environment supports visual inspection.

## Tools and authority

Use local file inspection and SVG-capable preview tools. A generative-image tool may propose a visual direction or raster source when authorized, but the final portable default remains a reviewable SVG. Do not contact external services, install tools, or upload package content without authority.

Treat existing icons and external examples as reference material. Do not copy protected marks or imply an affiliation. Keep secrets, personal data, machine paths, and hidden prompts out of SVG bytes and metadata.

## Output and evaluation

Return the icon path, chosen metaphor, validation result, and any unsupported host format. The primary output is one validated SVG asset; redesigning the skill, naming it, or editing unrelated package files belongs to other skills.

The icon passes when it represents the target responsibility, remains recognizable at small size, has a unique byte digest within the collection, contains no active or external content, and is referenced by the intended host metadata. Preserve the previous asset until the replacement validates; rollback restores that previous file.
