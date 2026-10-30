# Notes for AI agents

Small browser scripts and stylesheets in `js/` and `css/`, published as `@xiee/utils`. The `*.min.*` files are built by `build.sh` in CI; don't edit or commit them.

## Tests

Playwright tests in `tests/` load HTML fixtures in headless Chromium (jsdom is no use: the scripts need real layout and a real browser).

```sh
npm ci                                 # first time only
npx playwright install chromium        # first time only, unless a browser is installed
npm test                               # all tests
npx playwright test -g tabset          # tests whose name matches
CHROMIUM_PATH=/usr/bin/chromium-browser npm test   # use an installed browser
```

- Fix a bug or add a feature => add a test that fails without the change.
- Tests for a script go in `tests/<script>.spec.js`; write the fixture HTML inline and load the script from the repo by absolute `file://` URL (see `fixture()` in `tests/helper.js`).
- Assert behavior and invariants, not pixels or exact layout. A hang shows up as a timeout.
- `pages.js` tests (`tests/pages.spec.js`): `paginate()` paginates a fixture and returns the pages. Invariants: pagination finishes, pages fit, no blank page, no text lost/duplicated/reordered.
