/**
 * Målingene som trenger den virkelige koden lastet: determinisme, ytelse og hva demoen faktisk
 * produserer. `scripts/score.mjs` kjører denne gjennom tsx og leser JSON-en på stdout.
 *
 * Den er en sonde, ikke en test: den påstår ingenting og dømmer ingenting. Den teller.
 */
import { createHash } from 'node:crypto';
import { demoWorkspace } from '../src/demo/workspace';
import { runCheck } from '../src/domain/engine';
import type { Payslip, Shift, Workspace } from '../src/domain/schemas';

const FIXED_NOW = '2026-09-21T12:00:00.000Z';

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** En arbeidstaker i fast turnus i `weeks` uker: fem vakter i uka, én lønnsslipp i måneden. */
function syntheticWorkspace(weeks: number): Workspace {
  const base = demoWorkspace(FIXED_NOW);
  const start = '2024-01-01';
  const shifts: Shift[] = [];
  for (let week = 0; week < weeks; week += 1) {
    for (const day of [0, 1, 2, 3, 4]) {
      const date = addDays(start, week * 7 + day);
      shifts.push({
        id: `vakt-${week}-${day}`,
        date,
        // Hver tredje vakt er en nattevakt, så nattreglene og døgnlogikken får arbeid å gjøre.
        start: day % 3 === 0 ? '22:00' : '08:00',
        end: day % 3 === 0 ? '06:00' : '16:00',
        breakMinutes: 30,
        kind: 'jobbet',
        source: 'manuell',
        note: null,
        documentRef: null,
      });
    }
  }
  const payslips: Payslip[] = [];
  for (let month = 0; month < Math.ceil((weeks * 7) / 30); month += 1) {
    const first = addDays(start, month * 30);
    payslips.push({
      id: `slipp-${month}`,
      periodStart: first,
      periodEnd: addDays(first, 29),
      lines: [
        {
          id: `l-${month}`,
          category: 'ordinaer',
          label: 'Timelønn',
          hours: 150,
          rateOre: 19850,
          amountOre: 2977500,
        },
      ],
      grossOre: 2977500,
      feriepengerBasisOre: null,
      feriepengerAccruedOre: null,
      documentRef: null,
    });
  }
  return { ...base, shifts, payslips, documents: [] };
}

const demo = runCheck(demoWorkspace(FIXED_NOW), { now: FIXED_NOW });
const again = runCheck(demoWorkspace(FIXED_NOW), { now: FIXED_NOW });

const demoFlags = demo.flags.map((flag) => ({
  ruleId: flag.ruleId,
  id: flag.id,
  severity: flag.severity,
  amountOre: flag.amountOre,
  hasEvidence: flag.evidence.length > 0,
  hasSource: flag.sources.length > 0,
  messageLength: flag.message.length,
}));

const performance: { weeks: number; shifts: number; ms: number }[] = [];
for (const weeks of [52, 104, 156, 260]) {
  const workspace = syntheticWorkspace(weeks);
  const started = Date.now();
  runCheck(workspace, { now: FIXED_NOW });
  performance.push({ weeks, shifts: workspace.shifts.length, ms: Date.now() - started });
}

process.stdout.write(
  `${JSON.stringify(
    {
      determinisme: {
        likeKjoringer: hash(demo) === hash(again),
        hash: hash(demo),
      },
      demo: {
        flaggTotalt: demo.flags.length,
        blockers: demo.blockers,
        owedOre: demo.totals.estimatedOwedOre,
        bySeverity: demo.totals.bySeverity,
        utenBevis: demoFlags.filter((flag) => !flag.hasEvidence).map((flag) => flag.id),
        utenKilde: demoFlags.filter((flag) => !flag.hasSource).map((flag) => flag.id),
        /** Et falskt krav her er det ene verktøyet aldri skal produsere. */
        sannsynligFeil: demoFlags.filter((flag) => flag.severity === 'sannsynlig_feil'),
        korteMeldinger: demoFlags.filter((flag) => flag.messageLength < 80).map((flag) => flag.id),
      },
      ytelse: performance,
    },
    null,
    2,
  )}\n`,
);
