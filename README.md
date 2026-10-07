# Cottage 44 menu

A responsive digital menu for Cottage 44. The menu frontend uses plain HTML,
CSS, and JavaScript with no build step or runtime dependencies. A separate
Cloudflare Pages Functions API provides the backend foundation.

## Local preview

Open `docs/index.html` in a browser, or serve the `docs/` directory with any
static file server.

## Backend foundation

Cloudflare Pages Functions provide the API and owner administration. The
public menu reads only today's plate; `/admin/` supports owner sign-in, saved
plates, image uploads, date history, and setting today's plate. Supabase Auth
password tokens are held in a Secure/HttpOnly/SameSite cookie and are never
stored in browser local storage. Database and Storage RLS enforce the owner
email independently of the UI. See
[the architecture and setup notes](docs/architecture.md) for security choices,
local bindings, production/preview configuration, and required manual setup.

For local API development, install dependencies with `npm ci`, copy
`.env.example` to `.dev.vars`, and replace its placeholders with the Supabase
project URL and publishable key. Start Pages locally with `npm run dev`.
`.dev.vars` is ignored by Git and must not be committed. The admin UI and API
require Cloudflare Pages; GitHub Pages serves only the static menu.
Owner password resets use Supabase's one-time recovery email. Configure
`ADMIN_SITE_URL` for each Pages environment and the exact Supabase redirect
URLs and recovery email template as described in
[the setup notes](docs/architecture.md#local-setup-and-manual-account-steps).

## GitHub Pages

The static site is in `docs/`, with `docs/index.html` as its entry point.
In the repository's **Settings → Pages**, set the source to **Deploy from a
branch**, choose branch `main` and folder `/docs`, then save. The deployed
`docs/CNAME` preserves the `menu.cottage44.co.za` custom domain. The Actions
CI workflow checks changes but does not deploy the site.

## Continuous integration

The `checks` job runs for pull requests and for pushes to `dev` or `main`. It
installs from the lockfile, runs the menu and API tests with Node's built-in
V8 coverage collection, type-checks the Functions, checks static files and
JavaScript syntax, and builds the Pages Functions bundle with Wrangler. The
coverage summary measures `docs/menu.js`; HTML, CSS, the inline theme script,
and API files are not included in that LCOV report. The `javascript-coverage`
artifact contains LCOV and text reports. CI does not deploy to a hosting
provider.

Successful CI runs on this repository upload `coverage/lcov.info` to Codecov.
Fork pull requests still run checks and retain the coverage artifact, but skip
the upload because they cannot access the Codecov environment secret. Browse
coverage by file and branch on the
[Codecov dashboard](https://app.codecov.io/gh/sdcreek240/Cottage44-menu). The
dashboard and pull request comments require Codecov's GitHub App to be
authorized for this repository.

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
(`#C12025`). Components should use the semantic `--color-*` tokens instead of
hard-coding colors. Both light and dark themes use the same brand accent,
including on the owner admin page.
