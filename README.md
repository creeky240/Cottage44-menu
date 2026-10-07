# Cottage 44 menu

A responsive digital menu for Cottage 44. The menu frontend uses plain HTML,
CSS, and JavaScript with no build step or runtime dependencies. A separate
Cloudflare Pages Functions API provides the backend foundation.

## Local preview

Open `docs/index.html` in a browser, or serve the `docs/` directory with any
static file server.

## Backend foundation

The first backend slice uses Cloudflare Pages Functions for server-side API
requests to Supabase; the browser does not connect directly to the database.
It adds `GET /api/health` and `GET /api/plates/today`. The daily plate uses the
`Africa/Johannesburg` business date. See
[the architecture and setup notes](docs/architecture.md) for the response
shape, local Functions setup, and migration instructions.

For local API development, install dependencies with `npm ci`, copy
`.env.example` to `.dev.vars`, and replace its placeholders with the Supabase
project URL and publishable key. Start Pages locally with `npm run dev`.
`.dev.vars` is ignored by Git and must not be committed.

## GitHub Pages

The static site is in `docs/`, with `docs/index.html` as its entry point.
In the repository's **Settings → Pages**, set the source to **Deploy from a
branch**, choose branch `main` and folder `/docs`, then save. The deployed
`docs/CNAME` preserves the `menu.cottage44.co.za` custom domain. The Actions
CI workflow checks changes but does not deploy the site.

## Continuous integration

The `CI / checks` job runs for pull requests and for pushes to `dev` or `main`.
It installs from the lockfile, runs menu and API unit tests with coverage,
type-checks the Functions, checks static files and JavaScript syntax, and
builds the Pages Functions bundle with Wrangler. CI does not deploy to a
hosting provider.

GitHub Pages is the current static deployment; Cloudflare Pages is the proposed
production host. This backend foundation does not deploy Pages or change DNS.
See [the architecture proposal](docs/architecture.md) for setup status.

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
