# Portable SVG icon contract

Use this contract for the final package asset:

- one square SVG with `viewBox="0 0 64 64"` and a concise accessible `<title>`;
- simple geometry that remains legible at 32 pixels;
- sufficient contrast and no dependence on color alone;
- no scripts, event handlers, animation, embedded raster data, external URLs, fonts, or style imports;
- no trademarks, copied artwork, private prompts, personal data, credentials, or local paths;
- a distinct metaphor and distinct bytes within the target collection;
- a package-relative host reference such as `./assets/icon.svg` when host metadata is present.

When a host requires a raster asset, derive it from the reviewed SVG and retain the SVG as the editable source. Record the conversion tool and dimensions beside the generated artifact when provenance is required.

