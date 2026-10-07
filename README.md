# Cottage 44 menu

A responsive, static digital menu for Cottage 44. The site uses plain HTML,
CSS, and JavaScript; it has no build step, server, or runtime dependencies.

## Local preview

Open `docs/index.html` in a browser, or serve the `docs/` directory with any
static file server.

## GitHub Pages

The static site is in `docs/`, with `docs/index.html` as its entry point.
In the repository's **Settings → Pages**, set the source to **Deploy from a
branch**, choose branch `main` and folder `/docs`, then save. The deployed
`docs/CNAME` preserves the `menu.cottage44.co.za` custom domain. The Actions
CI workflow checks changes but does not deploy the site.

## Continuous integration

The `CI / checks` job runs for pull requests targeting `dev` or `main` and for
pushes to either branch. It installs from the lockfile, runs the menu tests,
checks JavaScript syntax, and verifies the static entry point and stylesheet
exist. There is no lint, typecheck, or build stage because the site has no
application toolchain; CI does not deploy to a hosting provider.

Menu items and prices are maintained in `docs/menu.js`. The light/dark theme
preference is stored in the browser.

The supplied source menu PDF is retained separately at `assets/original-menu.pdf`;
it is not part of the published site.

## Typography

The menu heading and category headings use the locally bundled Bangers font
by The Bangers Project Authors, served from `docs/fonts/bangers/`. It is
distributed under the SIL Open Font License 1.1; see
`docs/fonts/bangers/OFL.txt`. The font is from
[Google Fonts](https://github.com/google/fonts/tree/9710da1eacb3be272583c3224dcb70f9da6eadbb/ofl/bangers).

## Color tokens

The brand palette lives at the top of `docs/styles.css` in the `--brand-*`
tokens: charcoal `--brand-primary` (`#2c2a2a`) and red `--brand-accent`
(`#c32025`). Components should use the semantic `--color-*` tokens instead of
hard-coding colors. Dark mode uses readable text and accent variants while the
canonical brand tokens remain unchanged. Update the brand tokens in one place
to change the palette consistently across the site.
