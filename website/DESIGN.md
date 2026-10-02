---
version: alpha
name: I-9 Skills Field Manual
description: An editorial, precise promotion surface for focused agent skill management.
colors:
  primary: "#14231A"
  secondary: "#536056"
  tertiary: "#D7F46B"
  neutral: "#F7F9F2"
  surface: "#FFFFFF"
  line: "#B7BFB6"
  on-primary: "#F7F9F2"
  on-tertiary: "#14231A"
  focus: "#315D38"
typography:
  h1:
    fontFamily: Arial
    fontSize: 8rem
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.055em"
  h1-emphasis:
    fontFamily: Georgia
    fontSize: 8.56rem
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "-0.05em"
  h2:
    fontFamily: Arial
    fontSize: 4.5rem
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.045em"
  h3:
    fontFamily: Arial
    fontSize: 1.75rem
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.025em"
  body-md:
    fontFamily: Arial
    fontSize: 1.125rem
    fontWeight: 400
    lineHeight: 1.5
  lead:
    fontFamily: Arial
    fontSize: 1.5rem
    fontWeight: 400
    lineHeight: 1.4
  control:
    fontFamily: Arial
    fontSize: 1rem
    fontWeight: 600
    lineHeight: 1.25
  code:
    fontFamily: monospace
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.65
rounded:
  sm: 4px
  md: 8px
spacing:
  xs: 8px
  sm: 16px
  md: 24px
  lg: 40px
  xl: 64px
  section: 96px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: 20px
  button-primary-hover:
    backgroundColor: "{colors.focus}"
    textColor: "{colors.on-primary}"
  lifecycle-band:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    padding: 64px
  evidence-band:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    padding: 40px
  command:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.tertiary}"
    typography: "{typography.code}"
    rounded: "{rounded.sm}"
    padding: 20px
  filter-selected:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: 12px
  search:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 20px
  body:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    typography: "{typography.body-md}"
  divider:
    backgroundColor: "{colors.line}"
    height: 1px
---

## Overview

I-9 Skills is a modular framework for the full life of an agent skill. The site
feels like a contemporary field manual: tangible, focused and straightforward.
One original sculptural image makes the package boundary visible; the usable
catalog, source links and installation commands carry the argument.

This is a product-specific direction. It retains the I-9 preference for clarity,
editorial rules, deliberate decisions and restrained motion. It does not replace
the corporate identity or imply a new approved organizational logo. The brand
mark is ordinary code-native text, **I-9 Skills**.

The favicon is an original package outline in acid-lime on a rounded forest-ink
tile. Keep the silhouette legible at 16 and 32 pixels, with no lettering, external
resources or active SVG content. It identifies this product rather than replacing
the organizational logo.

Selected design inputs are the generated opening, lifecycle, catalog,
installation/evidence and mobile concepts. These are design references, not
screenshots proving a running product. The underlying pages remain ordinary
semantic HTML. The final rendered build requires human approval before any
publication.

## Colors

- **Primary:** forest ink `#14231A` for text, actions, command blocks and lifecycle.
- **Secondary:** `#536056` for readable supporting text; never use opacity to make
  essential metadata weaker than its required contrast.
- **Tertiary:** acid-lime `#D7F46B` for meaningful ordinals, command text and the
  evidence band. Use primary text on lime, never white.
- **Neutral:** paper-white `#F7F9F2` is the exact canvas character. Do not replace it
  with beige, cream, true white or a gradient.
- **Surface:** true white `#FFFFFF` is reserved for a necessary control surface.
- **Line:** `#B7BFB6` structures open lists; it does not provide the sole focus cue.
- **Focus:** `#315D38` produces a 3 px keyboard ring with a visible canvas offset.
  On dark backgrounds, use the lime ring instead.

No purple glow, neon grid, gradient wash, background noise texture or tinted
overlay. Text contrast targets WCAG 2.2 AA. The optimized original artwork must
blend through its transparency and matching material colors.

## Typography

Use the platform Arial/Helvetica sans stack for content and every control. Use
Georgia italic only for the second line of editorial headings; no decorative
serif in descriptions, commands or navigation. Commands use the platform
monospace stack. This avoids new font dependencies or remote requests.

The nominal tokens describe desktop maxima. Implement fluid H1 and H2 sizes,
bounded by the available column and language. Preserve semantic H1 once per
document, sequential headings and natural language line breaks. Never apply a
fixed nowrap rule to a headline. On narrow screens, use approximately 52–60 px
H1, 40–48 px H2, 28 px H3, 18 px body and 16 px controls. Long canonical names may
wrap at hyphens; commands have their own horizontal scrolling box rather than
forcing the page to overflow.

## Layout

The desktop container is 1312 px maximum with 64 px gutters at 1440 px. At tablet
use 32 px gutters; at narrow mobile use 24 px. Opening layout uses two balanced
columns, with the original illustration on the right and restrained next-section
visibility. Mobile order is brand/languages, native nav, headline, body, primary
action, secondary link, illustration, facts and lifecycle.

Page order is fixed: opening → lifecycle → catalog → installation → evidence and
footer. Vary rhythm deliberately: open two-column opening, dark four-column
lifecycle band, dense catalog rows, asymmetric installation lanes, lime evidence
band. Use rules and whitespace; do not add a card around each section.

Catalog rows have distinct existing skill icons, canonical name, description,
category and a meaningful source link. At desktop the row is a broad open rail;
at mobile name and icon lead, description follows and the category/source link
remain reachable. All 24 current packages render without pagination; filtering
is a progressive enhancement. Search controls appear only when enhancement can
run, so the no-JavaScript baseline exposes the full useful list without inert UI.

## Elevation & Depth

The generated hero artwork owns visual depth through matte material, paper edges
and restrained realistic lighting. Ordinary UI is flat. No oversized component
shadow, glass effect, frosted panel or floating interface frame. Preserve image
dimensions to prevent layout shift; do not overlay text on the artwork.

## Shapes

Rules and mostly rectangular components match focused boundaries. Buttons and
commands use 4 px corners. Existing canonical skill icons retain their individual
shapes and source colors; do not replace them with the generic lime icon samples
invented in the concept. Directional/search/copy icons are small clean inline SVG,
with a 24 px viewBox and consistent 1.75–2 px strokes. Do not use text-arrow glyphs
for the primary button.

## Components

- **Header:** textual wordmark, essential native links and EN/PT/ES links. Mobile
  nav stays visible and wraps cleanly; no hamburger hides essential destinations.
- **Opening:** exact English copy “Better skills.” / “By design.” and “Create,
  evaluate and evolve agent skills. One responsibility. One reviewable output.”
  Primary CTA “Explore the catalog”; secondary “Choose your install path”. No
  decorative eyebrow or status badge.
- **Lifecycle:** four numbered columns, Create / Verify / Improve / Distribute,
  with actual package links. On narrow screens use a vertical sequence.
- **Catalog:** one labeled search field, five categories plus All, count/reset,
  empty state and broad ruled skill rows. Selected category uses a dark rectangle
  and `aria-pressed`; keyboard focus remains independent of selection.
- **Installation:** three always-visible lanes. Distinguish portable Skills CLI,
  Codex root plugin and toolkit CLI. Code remains selectable. Copy is an optional
  button with explicit success/failure status, never a clickable decorative icon.
- **Evidence:** lime band explains portable core, evidence limits and experimental
  state. Documented provider details use readable prose/source links, not logo
  grids or broad compatibility checkmarks.
- **Footer:** source, docs, Apache-2.0, privacy and terms links; localized policy
  labels identify the English content. No invented publication status,
  provider endorsement, testimonial, email form or download count.

Source English descriptions and canonical package names remain attributable to
the actual catalog in every locale. All interface and editorial message keys
have equivalent English, Portuguese and Spanish values. Stable anchors and
catalog URL parameters are preserved when switching languages.

The privacy and terms routes use the same wordmark, navigation, footer, colors
and typography. Their English text sits in one readable column with sequential
headings, generous paragraph spacing and ordinary underlined links. They load no
JavaScript or extra imagery. Their navigation returns to the catalog sections;
the catalog layout and page order remain unchanged.

## Do's and Don'ts

- Show real source data and actual manual commands; verify registry status before
  promoting a registry command as available.
- Keep essential content static, visible and usable with no JavaScript.
- Use the generated hero asset as illustration, never product or customer proof.
- Respect `prefers-reduced-motion`. Disable all entrance/transitions when set.
- Keep finite motion subtle: up to 220 ms for state feedback, up to 450 ms for a
  single opening entrance, less than 12 px movement. No looping animation,
  parallax, scroll hijacking, WebGL or flashing. Motion never determines visibility.
- Keep key targets at least 44 px, focus visible and headings readable at 375 px.
- Do not add gradients, orbiting shapes, nested cards, new media, fake dashboards,
  provider logo claims or sections absent from the architectural contract.
- Do not interpret a local preview, generated concept or passing check as site
  publication approval.

## Design evidence and deliberate exceptions

The generated opening's preview caption “From idea to impact” is discarded; the
dedicated lifecycle concept governs that section. The catalog concept's sample
icons are replaced by each real package's existing asset, as required by the real
catalog source. Repeated headers in standalone section references are context,
not duplicate headers in the complete page. Install registry text now uses the
published 0.1.0 package after fresh-cache CLI and MCP consumer verification;
the canonical documentation is the factual source. No other above-the-fold copy or major component family is
introduced silently.

Independent review and browser evidence must cover the actual final commit.
Publication remains a separate human decision on the rendered build and target.
