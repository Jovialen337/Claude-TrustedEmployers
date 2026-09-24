---
name: run-app
description: Launch and drive Lønnssjekk locally — the exact start command, the data directory, and a Playwright driver that clicks through the app. Use when asked to run, start, restart or screenshot this app, to load the demo data, or to confirm a change works in the real app rather than only in tests.
---

# Running Lønnssjekk

A Next.js app with local JSON storage. No database, no login, no API key needed —
document reading is the only feature that wants one, and everything else works
without it.

## Start it

```bash
npm install                    # first time only
npm run build && npm start     # http://localhost:3000
```

**Use `npm start`, not `npm run dev`.** In a container the dev server's HMR
WebSocket cannot complete its upgrade in the browser, React never hydrates, and
every page sits on «Laster …» forever while the HTML and all 18 script tags load
fine. `next start` has no HMR and is unaffected. (The server is healthy either
way: `curl` performing the same upgrade against it gets `101 Switching
Protocols`. It is the browser side that fails.)

In the background, waiting for the port rather than sleeping:

```bash
nohup npx next start -p 3000 > /tmp/app.log 2>&1 &
for i in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:3000/ && break; sleep 1; done
```

## Stop it

```bash
pkill -f 'next-serve[r]'
```

**The brackets matter.** `pkill -f next-server` matches the shell running that
very command, so the tool call kills itself and returns exit 144 with no output.
`next-serve[r]` cannot match itself.

## Data

Everything lives in one file: `.data/workspace.json`.

```bash
rm -rf .data                                   # start from an empty workspace
LONNSSJEKK_DATA_DIR=.data-scratch npm start    # or keep real data out of the way
curl -sf -X POST http://127.0.0.1:3000/api/demo -o /dev/null   # load the demo worker
```

The demo is a fake worker (Kari Nordmann, Kafé Nordlys AS) with three months of
data and planted errors. It should produce **22 findings** and
**643638 øre** (6 436,38 kr) owed — assert those, not a vaguer "some findings".

## Routes worth hitting directly

```bash
curl -sf http://127.0.0.1:3000/api/check | head -c 400   # the whole check result
curl -sf http://127.0.0.1:3000/api/extract               # {"available":false} without a key
curl -sf -o /tmp/rapport.pdf -w '%{http_code} %{content_type}\n' \
  http://127.0.0.1:3000/api/report                       # 200 application/pdf
npm run smoke                                            # 26 checks, needs the server up
```

`npm run smoke` covers every route end to end and is the fastest way to know the
chain works. It writes to the app's data directory, so point the server at a
scratch one first if there is data worth keeping.

## Drive it in a browser

Playwright is installed globally, not as a project dependency, and its browsers
are already downloaded. **Do not run `playwright install`.**

```js
// node driver.mjs   — import from the global path, not 'playwright'
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1120, height: 1050 }, deviceScaleFactor: 1 });

// Always collect these. A page can render its shell while every fetch fails.
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  // The HMR socket error is expected noise in a container; anything else is real.
  if (m.type() === 'error' && !m.text().includes('_next/hmr')) problems.push(m.text());
});

await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });

// Get to a known state whatever was there before. The demo button only exists on an
// empty workspace, so clicking it unconditionally breaks the second time you run this.
if (await page.locator('button:has-text("Vis meg et eksempel først")').count()) {
  await page.click('button:has-text("Vis meg et eksempel først")');
} else {
  await page.evaluate(() => fetch('/api/demo', { method: 'POST' }));
  await page.reload({ waitUntil: 'networkidle' });
}
await page.waitForSelector('a:has-text("Kjør sjekken")');
await page.click('a:has-text("Kjør sjekken")');
await page.waitForSelector('details.flag');                          // never sleep for this

const first = page.locator('details.flag').first();
await first.locator('summary').click();
console.log('finding:', (await first.locator('.title').textContent())?.trim());
console.log('calculation:', (await first.locator('.calc').textContent())?.trim());

await page.screenshot({ path: '/tmp/sjekk.jpg', type: 'jpeg', quality: 72 });
console.log('problems:', problems.length ? problems.join(' | ') : 'none');
await browser.close();
```

Then **look at the screenshot.** The assertions above pass on a page whose text
is right and whose layout is broken.

### Selectors that work

- **Form fields:** `page.getByLabel('Stillingsprosent')`. Every single-control
  field ties its label to the input with `htmlFor`.
- **Fields holding a *group*** of controls (radio buttons, checkboxes — "Lønn",
  "Sats", "Er pausen betalt?") deliberately have no `htmlFor`; reach those by
  `input[aria-label="Sats for tillegget"]`.
- **Collapsed sections:** click the `summary` first, and scope the click to the
  right one — there are 16 rules on the settings page, each with an identically
  named button inside:
  ```js
  const rule = page.locator('details.flag', { hasText: 'Trekk i lønn' }).first();
  await rule.locator('summary').click();
  await rule.locator('button:has-text("Slå av denne regelen")').click();
  ```
- **Inputs are React-controlled**, so `fill`/`type` — never `el.value = ...`,
  which fires no onChange.

### One representative pass

Empty start page → click the demo button → run the check → open a finding and
read its calculation → the timeline → `/rapport` for the draft message → fetch
`/api/report` → `/innstillinger` for the document list. Then repeat `/sjekk` at
390px width and assert `scrollWidth - clientWidth === 0`; the tables scroll
inside their own wrapper, the page itself must not.

## Gotchas

- **The demo button only exists on an empty workspace.** `/` shows
  «Vis meg et eksempel først» when nothing is stored and the stats plus «Kjør
  sjekken» once something is. A driver that clicks it unconditionally works once
  and then hangs for 30s — check for it, or `POST /api/demo` instead.
- **Screenshots for chat:** full-page PNGs run to ~1.1 MiB and get rejected on
  upload. Use `type: 'jpeg', quality: 72, deviceScaleFactor: 1`, and prefer a
  viewport shot over `fullPage` for a long page.
- **`npm run build` type-checks the tests too.** A type error in a test file
  fails the build even though `npx vitest run` is green. Run
  `npx tsc --noEmit` after touching tests.
- **`vitest --reporter=basic` does not exist** in vitest 5; the default reporter
  is what you want.
- **Money is integer øre everywhere.** Assert `643638`, and format with
  `formatKr` only for display.
- **Norwegian text in assertions** needs the real characters (æ ø å, «», ×, §).
  Copy them from the source rather than retyping.
