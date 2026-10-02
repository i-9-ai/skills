# Plugin icon

`plugin-icon.png` is a 512 × 512 rendering of the original I-9 Skills package
mark in `website/assets/favicon.svg`. It uses the same forest-ink and acid-lime
colors as the website. The artwork is authored in this repository and is
distributed under its Apache-2.0 license; it is not a provider logo.

Render without network access using `rsvg-convert` (reviewed version 2.63.2):

```sh
rsvg-convert --width 512 --height 512 --output assets/plugin-icon.png website/assets/favicon.svg
```

The canonical listing references this one PNG for both the app logo and composer
icon. Plugin preparation validates its complete PNG content and dimensions
before copying it into a new artifact and recording its byte hash.
