/**
 * End-to-end smoke test against a running app.
 *
 *   npm run build && npm start        # in one terminal
 *   npm run smoke                     # in another
 *
 * Drives every API route the way the pages do — empty state, saving a contract, uploading a
 * schedule, running the check, the PDF, a rule override, and deleting everything — and fails
 * loudly if any of it stops working. No dependencies and no browser, so it runs anywhere.
 *
 * It writes to the app's real data directory, so point the server at a scratch one first if
 * you have data you care about:
 *   LONNSSJEKK_DATA_DIR=.data-smoke npm start
 */
const BASE = process.env.SMOKE_URL ?? 'http://127.0.0.1:3000';

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

async function json(path, init) {
  const response = await fetch(BASE + path, { cache: 'no-store', ...init });
  return { status: response.status, body: await response.json() };
}

const CONTRACT = {
  id: 'smoke-kontrakt',
  employer: 'Testbedrift AS',
  employeeName: 'Test Testesen',
  startDate: '2022-01-01',
  endDate: null,
  stillingsprosent: 50,
  fullTimeHoursPerWeek: 37.5,
  contractedHoursPerWeek: null,
  wage: { kind: 'hourly', amountOre: 20000 },
  tariffavtale: null,
  averagingAgreement: false,
  normalDailyLimitHours: null,
  normalWeeklyLimitHours: null,
  overtimeSupplementPercent: 50,
  maxOvertimeHoursPer7Days: null,
  maxOvertimeHoursPer4Weeks: null,
  maxOvertimeHoursPer52Weeks: null,
  agreedDailyRestHours: null,
  agreedWeeklyRestHours: null,
  breakRequiredAfterHours: null,
  longDayHours: null,
  minBreakMinutesLongDay: null,
  paidBreak: false,
  largerPositionLookbackMonths: null,
  sundayWorkAgreement: false,
  nightWorkAgreement: false,
  allmenngjortMinimumHourlyOre: null,
  jobTitle: 'Butikkmedarbeider',
  workplace: 'Storgata 1',
  employmentType: 'fast',
  temporaryBasis: null,
  workingTimeExemption: 'ingen',
  noticePeriodMonths: 1,
  probationMonths: 6,
  payDayOfMonth: 15,
  industry: null,
  feriepengerRatePercent: 10.2,
  supplements: [],
  documentRef: null,
};

console.log(`Smoke test against ${BASE}\n`);

/* ----------------------------------------------------------- empty state */
console.log('empty state');
check('DELETE /api/workspace', (await json('/api/workspace', { method: 'DELETE' })).status === 200);
{
  const { body } = await json('/api/workspace');
  check('workspace starts empty', body.contract === null && body.shifts.length === 0);
  const { body: result } = await json('/api/check');
  check('check reports what is missing', result.blockers.length === 3, `blockers=${result.blockers.length}`);
  check('check finds nothing to flag', result.flags.length === 0);
}

/* ------------------------------------------------- contract and payslips */
console.log('\nsaving data');
{
  const { body: workspace } = await json('/api/workspace');
  const saved = await json('/api/workspace', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...workspace,
      contract: CONTRACT,
      payslips: [
        {
          id: 'smoke-slipp',
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
          lines: [
            { id: 'l1', category: 'ordinaer', label: 'Timelønn', hours: 20, rateOre: 20000, amountOre: 400000 },
            { id: 'l2', category: 'trekk', label: 'Trekk for uniform', hours: null, rateOre: null, amountOre: 50000 },
          ],
          grossOre: null,
          feriepengerBasisOre: null,
          feriepengerAccruedOre: null,
          documentRef: null,
        },
      ],
    }),
  });
  check('PUT /api/workspace saves', saved.status === 200 && saved.body.contract.employer === 'Testbedrift AS');
}

/* -------------------------------------------------- schedule upload */
console.log('\nuploading a schedule');
{
  const csv = ['dato;start;slutt;pause', '2026-08-17;17:00;23:00;0', '2026-08-19;08:00;20:00;0', '2026-08-22;10:00;18:00;30'].join('\n');
  const form = new FormData();
  form.set('file', new File([csv], 'vaktplan.csv', { type: 'text/csv' }));
  form.set('kind', 'jobbet');
  const response = await fetch(`${BASE}/api/import-schedule`, { method: 'POST', body: form });
  const body = await response.json();
  check('POST /api/import-schedule parses the file', response.status === 200 && body.shifts.length === 3,
    `status=${response.status} shifts=${body.shifts?.length}`);
  check('it reads a shift across midnight and a break', body.shifts?.[2]?.breakMinutes === 30);
  check('it registers the document it read', typeof body.document?.id === 'string');
  check('the stored preview keeps the rows', String(body.document?.maskedTextPreview).includes('2026-08-17'));

  const { body: workspace } = await json('/api/workspace');
  const saved = await json('/api/workspace', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...workspace, shifts: body.shifts, documents: [body.document] }),
  });
  check('the shifts and the document save together', saved.body.shifts.length === 3 && saved.body.documents.length === 1);
}

/* ------------------------------------------------------------- the check */
console.log('\nrunning the check');
{
  const { body: result } = await json('/api/check');
  const ruleIds = [...new Set(result.flags.map((flag) => flag.ruleId))];
  check('no blockers once everything is in', result.blockers.length === 0, result.blockers.join('; '));
  check('the check produces findings', result.flags.length > 0, `flags=${result.flags.length}`);
  check('the deduction is flagged', ruleIds.includes('wage_deductions'), ruleIds.join(', '));
  check('the overtime supplement comes from the contract',
    result.flags.some((flag) => flag.ruleId === 'overtime' && (flag.calculation?.expression ?? '').includes('50 %')));
  check('every money finding shows a calculation that produces its amount',
    result.flags.filter((flag) => flag.amountOre !== null)
      .every((flag) => flag.calculation && flag.calculation.resultOre === flag.amountOre));
  check('every finding cites a source', result.flags.every((flag) => flag.sources.length > 0));
  check('the timeline covers the weeks', result.timeline.length > 0);
}

/* --------------------------------------------------- report and overrides */
console.log('\nreport and rule overrides');
{
  const response = await fetch(`${BASE}/api/report`, { cache: 'no-store' });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const header = String.fromCharCode(...bytes.slice(0, 5));
  check('GET /api/report returns a PDF', response.status === 200 && header === '%PDF-', `header=${header}`);
  check('the PDF is not empty', bytes.length > 5000, `${bytes.length} bytes`);

  const status = await json('/api/extract');
  check('GET /api/extract reports whether reading is available', typeof status.body.available === 'boolean');

  const { body: workspace } = await json('/api/workspace');
  await json('/api/workspace', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...workspace, ruleOverrides: { wage_deductions: { enabled: false } } }),
  });
  const { body: afterOff } = await json('/api/check');
  check('turning a rule off removes its findings',
    !afterOff.flags.some((flag) => flag.ruleId === 'wage_deductions'));
}

/* ---------------------------------------------------------- demo and wipe */
console.log('\ndemo data and deleting everything');
{
  const demo = await json('/api/demo', { method: 'POST' });
  check('POST /api/demo loads the demo worker', demo.status === 200 && demo.body.contract?.employer === 'Kafé Nordlys AS');
  const { body: result } = await json('/api/check');
  check('the demo produces its expected findings', result.flags.length === 22, `flags=${result.flags.length}`);
  check('the demo owes the expected amount', result.totals.estimatedOwedOre === 643638,
    `${result.totals.estimatedOwedOre} øre`);

  check('DELETE wipes it', (await json('/api/workspace', { method: 'DELETE' })).status === 200);
  const { body: after } = await json('/api/workspace');
  check('nothing is left', after.contract === null && after.shifts.length === 0 && after.documents.length === 0);
}

console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log(failures.map((failure) => `  - ${failure}`).join('\n'));
  process.exit(1);
}
