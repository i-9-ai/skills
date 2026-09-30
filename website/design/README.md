# Original design references

## Provenance

The five section/mobile references and standalone hero artwork were generated
for this project on 2026-09-30 using the built-in image-generation tool. No
third-party photo, customer logo, testimonial or template asset was imported.
The references are design inputs, not evidence of running software or measured
outcomes. They are distributed with this repository under its root license.

[generation.json](generation.json) records the exact prompts, original generated
PNG hashes and resulting repository artifact paths. The record deliberately
contains no machine paths or private source snapshots. The generation tool did
not provide a stable model/version identity, so none is inferred.

Concept PNGs were converted to WebP at quality 90 without altering composition.
The generated transparent hero was resized to 1100 × 917 and encoded at quality
82 with preserved alpha. The production hero asset is 53,508 bytes, SHA-256
09bdce8af90f4747dd42fe2aa287b4e5bbe55048bdbc44649fd8d1a0166bb851.
Conversion tools are optional asset-authoring tools; build/preview never require
them or run generation.

## Section references

- [Opening](hero.webp): editorial heading, native navigation/actions, original
  modular sculpture and restrained factual rail.
- [Lifecycle](workflow.webp): dark forest band with four real entry paths.
- [Catalog](catalog.webp): useful open ruled rows, search and category controls.
- [Installation and evidence](install.webp): three explicit manual paths and
  readable evidence limits.
- [Mobile continuation](mobile.webp): visible native navigation, stacked opening
  actions/artwork and vertical lifecycle continuation.

## Design decomposition

[DESIGN.md](../DESIGN.md) locks the paper-white/forest/lime palette, Arial/Georgia
system typography, mostly rectangular controls, open container model, responsive
order and reduced-motion behavior. Its tokens were exported to tokens.json with
the official design.md CLI 0.4.0; lint reported zero errors and zero warnings.
The [upstream format](https://github.com/google-labs-code/design.md) is a format
reference, not an imported UI asset.

## Deliberate implementation exceptions

- The opening concept's partial “From idea to impact” caption is discarded.
  The dedicated lifecycle concept supplies method/evidence language.
- Generic icons invented in the catalog reference are replaced with each
  canonical package's actual distinct icon. Arrow/search/facts SVGs remain
  functional interface icons.
- Repeated headers in isolated section references are screenshot context; the
  complete page has one header.
- Exact catalog descriptions come from the current catalog. Translated pages
  identify original English descriptions rather than silently translating their
  responsibility/boundary.
- A visible search label, accessible focus, copy feedback and keyboard skip link
  serve the user; controls stay hidden when JavaScript is unavailable.
- Manual commands follow documented real prerequisites and publication status,
  even when that requires a factual correction to an image mockup.
- Provider-limit prose and a review-only notice make the evidence/publication
  boundary explicit; no registry status is inferred from the design.

## Browser fidelity review

Review the final browser rendering against these references at desktop and
narrow widths. Inspect headline composition, sans/serif hierarchy, exact palette,
open section rhythm, artwork blending, catalog row density, native controls and
responsive continuation. A functional test alone does not establish fidelity.
Keep temporary screenshots and measured QA reports outside the tracked tree.
Publication still requires explicit approval of the rendered build and target.
