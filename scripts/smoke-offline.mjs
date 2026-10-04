/**
 * End-to-end smoke test of the offline single-file edition.
 *
 *   npm run build:offline
 *   npm run smoke:offline
 *
 * Opens `dist/Lonnssjekk.html` from disk, the way the user will, and drives it in a real
 * browser: the empty start page, the demo, the check, the week-by-week table, a schedule
 * uploaded as CSV and as PDF, the PDF report, persistence across a reload, "Slett alt", and
 * the layout at phone width.
 *
 * Why a browser and not `fetch` like `smoke.mjs`: in this edition the server *is* the page.
 * The things most likely to break are the parts no unit test can reach — whether localStorage
 * works from a `file://` origin, whether pdfjs can read a PDF with no worker URL to fetch,
 * whether pdfkit builds a PDF without Node's Buffer. Those only show up when the built file is
 * actually opened.
 *
 * Playwright is not a dependency of this project. If it is not installed, this says so and
 * exits 0 — it is a check you can run, not a gate you cannot pass.
 */
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.env.OFFLINE_FILE ?? path.join(root, 'dist', 'Lonnssjekk.html');

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function loadPlaywright() {
  // Installed globally in some environments, as a dependency in others.
  for (const specifier of [
    'playwright',
    '/opt/node22/lib/node_modules/playwright/index.mjs',
    'playwright-core',
  ]) {
    try {
      return await import(specifier);
    } catch {
      /* try the next one */
    }
  }
  return null;
}

async function fixtures() {
  const dir = await mkdtemp(path.join(tmpdir(), 'lonnssjekk-smoke-'));
  const csv = path.join(dir, 'vaktplan.csv');
  await writeFile(
    csv,
    [
      'dato;fra;til;pause',
      '2026-08-03;17:00;22:00;30',
      '2026-08-04;16:30;22:30;30',
      '2026-08-07;18:00;23:30;0',
      '2026-08-08;11:00;19:00;30 min',
      // Crosses midnight, which the segment logic has to split by calendar day.
      '2026-08-10;22:00;02:00;0',
    ].join('\n'),
    'utf8',
  );

  // A PDF with one shift per line: the case that used to arrive at the parser as one line.
  const { default: PDFDocument } = await import('pdfkit');
  const pdf = path.join(dir, 'vaktplan.pdf');
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const out = createWriteStream(pdf);
  doc.pipe(out);
  doc.fontSize(14).text('Vaktplan august 2026 - Eksempel AS');
  doc.moveDown();
  doc.fontSize(11);
  for (const row of [
    '2026-08-17;17:00;22:00;30',
    '2026-08-18;16:30;22:30;30',
    '2026-08-19;18:00;23:30;0',
    '2026-08-21;11:00;19:00;30',
  ]) {
    doc.text(row);
  }
  doc.end();
  await new Promise((resolve) => out.on('finish', resolve));

  return { dir, csv, pdf };
}

const playwright = await loadPlaywright();
if (playwright === null) {
  console.log('Playwright is not installed, so the offline edition cannot be driven here.');
  console.log('Install it (npm i -D playwright && npx playwright install chromium) and re-run.');
  process.exit(0);
}

const stats = await stat(target).catch(() => null);
if (stats === null) {
  console.log(`${target} does not exist. Run: npm run build:offline`);
  process.exit(1);
}

const html = await readFile(target, 'utf8');
console.log(`offline file             ${(stats.size / 1024 / 1024).toFixed(2)} MiB`);

console.log('\nthe file itself');
check('is a single self-contained HTML document', html.startsWith('<!doctype html>'));
check('carries its stylesheet inline', /<style>[\s\S]*\.topbar/.test(html));
check('references nothing over the network', !/<(script|link)[^>]+(src|href)="https?:/i.test(html));
check('says it is in Norwegian', /<html lang="nb">/.test(html));
check('tells a reader with JavaScript off what is wrong', html.includes('<noscript>'));

const { dir, csv, pdf } = await fixtures();
const url = `file://${target}`;
const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1120, height: 1000 }, acceptDownloads: true });
const problems = [];
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(message.text());
});

try {
  console.log('\nopening it, with nothing stored');
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('button:has-text("Vis meg et eksempel først")', { timeout: 30_000 });
  check('the start page renders from a file:// origin', true);
  check('localStorage is usable here', await page.evaluate(() => {
    try {
      localStorage.setItem('probe', '1');
      localStorage.removeItem('probe');
      return true;
    } catch {
      return false;
    }
  }));

  console.log('\nthe demo, and the check');
  await page.click('button:has-text("Vis meg et eksempel først")');
  await page.waitForSelector('a:has-text("Kjør sjekken")', { timeout: 30_000 });
  await page.click('a:has-text("Kjør sjekken")');
  await page.waitForSelector('details.flag', { timeout: 30_000 });

  const flags = await page.locator('details.flag').count();
  check('the demo produces its expected findings', flags === 22, `flags=${flags}`);

  const totals = await page.evaluate(async () => {
    const response = await fetch('/api/check');
    return (await response.json()).totals;
  });
  check('the demo owes the expected amount', totals.estimatedOwedOre === 643638, `${totals.estimatedOwedOre} øre`);
  check('the hours never given match', totals.underScheduledOre === 148875, `${totals.underScheduledOre} øre`);
  check('the severities split as expected',
    totals.bySeverity.sannsynlig_feil === 6 && totals.bySeverity.bor_sjekkes === 6 && totals.bySeverity.til_info === 10,
    JSON.stringify(totals.bySeverity));

  const first = page.locator('details.flag').first();
  await first.locator('summary').click();
  const calculation = (await first.locator('.calc').textContent())?.trim() ?? '';
  check('a finding shows the calculation behind it', calculation.includes('×') && calculation.includes('kr'), calculation);

  await page.locator('h2:has-text("Uke for uke")').scrollIntoViewIfNeeded();
  const rows = await page.locator('table tbody tr').count();
  check('the week-by-week table covers the period', rows === 14, `rows=${rows}`);

  console.log('\nit remembers');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('details.flag', { timeout: 30_000 });
  check('the data survives a reload', (await page.locator('details.flag').count()) === 22);

  console.log('\nthe report');
  await page.goto(`${url}#/rapport`, { waitUntil: 'load' });
  await page.waitForSelector('textarea', { timeout: 30_000 });
  const draft = await page.locator('textarea').first().inputValue();
  check('a draft message to the employer is ready', draft.startsWith('Hei,'), draft.slice(0, 40));
  check('the draft names the period', draft.includes('2026'));

  const downloaded = page.waitForEvent('download', { timeout: 60_000 });
  await page.click('a.button.primary');
  const download = await downloaded;
  const saved = path.join(dir, 'rapport.pdf');
  await download.saveAs(saved);
  const bytes = new Uint8Array(await readFile(saved));
  check('the PDF is built in the browser and offered as a download', download.suggestedFilename().endsWith('.pdf'));
  check('it is a real PDF', new TextDecoder('latin1').decode(bytes.subarray(0, 5)) === '%PDF-');
  check('it is not an empty one', bytes.length > 20_000, `${bytes.length} bytes`);

  console.log('\nuploading a schedule, with no API key');
  await page.goto(`${url}#/innstillinger`, { waitUntil: 'load' });
  await page.waitForSelector('button:has-text("Slett alt")', { timeout: 30_000 });
  await page.click('button:has-text("Slett alt")');
  await page.click('button:has-text("Ja, slett alt")');
  await page.waitForTimeout(500);

  await page.goto(`${url}#/vakter`, { waitUntil: 'load' });
  await page.waitForSelector('input[type=file]', { timeout: 30_000 });

  for (const [label, file, expected] of [['CSV', csv, 5], ['PDF', pdf, 4]]) {
    await page.setInputFiles('input[type=file]', file);
    await page.click('button:has-text("Les fila")');
    await page.waitForSelector('h3:has-text("Stemmer dette?")', { timeout: 60_000 });
    const read = page.locator('h3:has-text("Stemmer dette?") ~ div.table-wrap tbody tr');
    const count = await read.count();
    check(`a schedule uploaded as ${label} is read on the device`, count === expected, `rows=${count}`);
    await page.click('button:has-text("Dette stemmer")');
    await page.waitForTimeout(500);
  }

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lonnssjekk:workspace') ?? '{}'));
  check('both uploads are saved', stored.shifts?.length === 9, `shifts=${stored.shifts?.length}`);
  check('the shift across midnight survives', stored.shifts?.some((shift) => shift.start === '22:00' && shift.end === '02:00'));
  check('each file is recorded so it can be inspected and deleted', stored.documents?.length === 2);
  check('the stored preview is masked text, not the raw file',
    typeof stored.documents?.[1]?.maskedTextPreview === 'string' && stored.documents[1].maskedTextPreview.includes('2026-08-17'));

  console.log('\nreading documents with the AI is off, and says why');
  const availability = await page.evaluate(async () => (await fetch('/api/extract')).json());
  check('the extract route reports it as unavailable', availability.available === false);
  check('it gives a reason that fits a single file', typeof availability.reason === 'string' && availability.reason.includes('én enkelt fil'));
  check('it does not tell the reader to edit .env', !availability.reason.includes('.env'));

  console.log('\nphone width');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${url}#/vakter`, { waitUntil: 'load' });
  await page.waitForSelector('input[type=file]', { timeout: 30_000 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check('the page does not scroll sideways at 390px', overflow === 0, `${overflow}px`);

  console.log('\nSlett alt');
  await page.goto(`${url}#/innstillinger`, { waitUntil: 'load' });
  await page.waitForSelector('button:has-text("Slett alt")', { timeout: 30_000 });
  await page.click('button:has-text("Slett alt")');
  await page.waitForSelector('button:has-text("Ja, slett alt")');
  await page.click('button:has-text("Ja, slett alt")');
  await page.waitForTimeout(700);
  check('it leaves nothing behind', (await page.evaluate(() => localStorage.getItem('lonnssjekk:workspace'))) === null);

  check('nothing was logged as an error along the way', problems.length === 0, problems.join(' | '));
} finally {
  await browser.close();
}

console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log(failures.map((failure) => `  - ${failure}`).join('\n'));
  process.exit(1);
}
