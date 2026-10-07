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

The `checks` job runs for pull requests and for pushes to `dev` or `main`. It
installs from the lockfile, runs the menu tests with Node's built-in V8 coverage
collection, checks JavaScript syntax, and verifies the static entry point and
stylesheet exist. The job summary reports line and function coverage for
`docs/menu.js`, and the `javascript-coverage` artifact contains its LCOV and
text reports. HTML, CSS, and the inline theme initialization script are not
included in that JavaScript coverage figure. Coverage collection uses no
external service or secret. There is no lint, typecheck, or build stage because
the site has no application toolchain; CI does not deploy to a hosting provider.

Successful CI runs on this repository upload `coverage/lcov.info` to Codecov.
Fork pull requests still run checks and retain the coverage artifact, but skip
the upload because they cannot access the Codecov environment secret. Browse
coverage by file and branch on the
[Codecov dashboard](https://app.codecov.io/gh/sdcreek240/Cottage44-menu). The
dashboard and pull request comments require Codecov's GitHub App to be
authorized for this repository. The report measures `docs/menu.js` only; HTML,
CSS, and the inline theme initialization script are not included.

This describes the current deployment only. GitHub Pages' usage policy may not
permit a commercial restaurant website, so the proposed production destination
is Cloudflare Pages. See [the architecture proposal](docs/architecture.md)
before changing hosting or DNS.

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
