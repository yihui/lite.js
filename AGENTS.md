# Notes for AI agents

Small browser scripts and stylesheets in `js/` and `css/` (published as `@xiee/utils`; the `*.min.*` files are built by `build.sh` in CI, don't edit or commit them).

## Tests

Playwright tests in `tests/` run the scripts in headless Chromium (jsdom is no use: `pages.js` needs real layout).

```sh
npm ci                                 # first time only
npx playwright install chromium        # first time only, unless a browser is installed
npm test                               # all tests
npx playwright test -g tabset          # tests whose name matches
CHROMIUM_PATH=/usr/bin/chromium-browser npm test   # use an installed browser
```

- `tests/helper.js`: `fixture()` writes an HTML page that loads `css/pages.css` and `js/pages.js`; `paginate()` paginates it and returns the pages.
- Test invariants (pagination finishes, pages fit, no blank page, no text lost/duplicated/reordered), not pixels. A hang shows up as a timeout.
- Fix a `pages.js` bug => add a fixture to `tests/pages.spec.js` that fails without the fix.
- A `<main>` with a single child makes that child the content root; give fixtures a sibling (e.g., an intro `<p>`).
