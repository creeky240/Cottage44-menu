# Cottage 44 menu

A responsive, static digital menu for Cottage 44. The site uses plain HTML,
CSS, and JavaScript; it has no build step, server, or runtime dependencies.

## Local preview

Open `index.html` in a browser, or serve the repository root with any static
file server.

## GitHub Pages

Publish the repository root as the Pages source. `index.html` is the entry
point, and the existing `CNAME` file keeps the custom domain configured.

Menu items and prices are maintained in `menu.js`. The light/dark theme
preference is stored in the browser.

## Color tokens

The brand palette lives at the top of `styles.css` in the `--brand-*` tokens:
charcoal `--brand-primary` (`#2c2a2a`) and red `--brand-accent` (`#c32025`).
Components should use the semantic `--color-*` tokens instead of hard-coding
colors. Dark mode uses readable text and accent variants while the canonical
brand tokens remain unchanged. Update the brand tokens in one place to change
the palette consistently across the site.
