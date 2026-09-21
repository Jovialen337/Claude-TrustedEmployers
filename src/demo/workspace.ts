/**
 * The demo workspace: a fake worker with three months of data containing deliberate errors.
 *
 * All names, employers and numbers are invented. There is no personnummer and no account
 * number anywhere, here or in the rest of the repository.
 *
 * The payslip figures are written out as literals rather than derived from the shifts, so
 * that the demo really is an independent check of the rules: if aggregation ever starts
 * counting hours differently, these numbers stop matching and the demo test fails.
 *
 * Hours actually worked, from the shift data (see src/demo/shifts.ts):
 *   mai   2026: 110,0 t — 64,0 t kveld (etter 18), 30,0 t helg, 10,0 t helligdag
 *   juni  2026: 121,0 t — 73,0 t kveld, 28,0 t helg
 *   juli  2026:  94,5 t — 50,0 t kveld, 22,5 t helg
 *
 * Planted errors:
 *   1. mai   — ordinary hours paid at 185,00 kr instead of the contract's 198,50 kr
 *   2. mai   — helligdagstillegg for 10 t on Kristi himmelfartsdag and 2. pinsedag missing
 *   3. juni  — kveldstillegg missing altogether
 *   4. juni  — Friday 19th runs to 23:00 and Saturday starts 07:00: only 8 h rest
 *   5. juli  — an 11-hour Wednesday with no break: 2 t overtime, paid as ordinary hours
 *   6. juli  — 2,5 t of worked hours simply not on the payslip
 *   7. juli  — week 28 cut to 15 t, well under the 60 % stillingsprosent
 *   8. juli  — feriepenger: 6 000,00 kr set aside on a stated basis of 65 000,00 kr
 */
import { Workspace, type Contract, type Payslip, type PayslipLine, type StoredDocument } from '../domain/schemas';
import { demoShifts, VAKTPLAN_DOC_ID } from './shifts';

export const DEMO_HOURLY_RATE_ORE = 19850; // 198,50 kr
const KVELD_ORE_PER_HOUR = 2500; // 25,00 kr
const HELG_ORE_PER_HOUR = 4500; // 45,00 kr

const KONTRAKT_DOC_ID = 'demo-kontrakt';

function slipRef(docId: string, name: string) {
  return { docId, docName: name, page: 1, kind: 'lonnsslipp' as const };
}

function money(kr: number): number {
  return Math.round(kr * 100);
}

let lineCounter = 0;
function payslipLine(
  category: PayslipLine['category'],
  label: string,
  hours: number | null,
  rateOre: number | null,
  amountOre: number,
): PayslipLine {
  lineCounter += 1;
  return { id: `demo-linje-${lineCounter}`, category, label, hours, rateOre, amountOre };
}

export function demoContract(): Contract {
  return {
    id: 'demo-kontrakt',
    employer: 'Kafé Nordlys AS',
    employeeName: 'Kari Nordmann',
    startDate: '2025-09-01',
    endDate: null,
    stillingsprosent: 60,
    fullTimeHoursPerWeek: 37.5,
    contractedHoursPerWeek: null, // 60 % av 37,5 t = 22,5 t i uka
    wage: { kind: 'hourly', amountOre: DEMO_HOURLY_RATE_ORE },
    tariffavtale: 'Eksempeltariff (demodata — ikke en virkelig avtale)',
    averagingAgreement: false,
    normalDailyLimitHours: null,
    normalWeeklyLimitHours: null,
    feriepengerRatePercent: 10.2,
    supplements: [
      {
        id: 'demo-kveld',
        label: 'Kveldstillegg etter kl. 18',
        kind: 'kveld',
        fromTime: '18:00',
        toTime: '00:00',
        weekdays: null,
        rate: { kind: 'per_hour_ore', value: KVELD_ORE_PER_HOUR },
        source: 'Arbeidskontrakt pkt. 6',
      },
      {
        id: 'demo-helg',
        label: 'Helgetillegg lørdag og søndag',
        kind: 'helg',
        fromTime: null,
        toTime: null,
        weekdays: [6, 7],
        rate: { kind: 'per_hour_ore', value: HELG_ORE_PER_HOUR },
        source: 'Arbeidskontrakt pkt. 6',
      },
      {
        id: 'demo-helligdag',
        label: 'Helligdagstillegg',
        kind: 'helligdag',
        fromTime: null,
        toTime: null,
        weekdays: null,
        rate: { kind: 'percent', value: 100 },
        source: 'Eksempeltariff § 4',
      },
    ],
    documentRef: {
      docId: KONTRAKT_DOC_ID,
      docName: 'Arbeidsavtale Kafé Nordlys AS.pdf',
      page: 2,
      kind: 'kontrakt',
    },
  };
}

function demoPayslips(): Payslip[] {
  /* ---------------------------------------------------------------- mai 2026 */
  // Feil 1: 110 t betalt med 185,00 kr i stedet for 198,50 kr.
  // Feil 2: ingen linje for helligdagstillegg (10 t × 198,50 kr = 1 985,00 kr mangler).
  const mai: PayslipLine[] = [
    payslipLine('ordinaer', 'Timelønn', 110, money(185), money(110 * 185)),
    payslipLine('kveldstillegg', 'Kveldstillegg', 64, KVELD_ORE_PER_HOUR, money(64 * 25)),
    payslipLine('helgetillegg', 'Helgetillegg', 30, HELG_ORE_PER_HOUR, money(30 * 45)),
  ];

  /* --------------------------------------------------------------- juni 2026 */
  // Feil 3: ingen linje for kveldstillegg (73 t × 25,00 kr = 1 825,00 kr mangler).
  const juni: PayslipLine[] = [
    payslipLine('ordinaer', 'Timelønn', 121, DEMO_HOURLY_RATE_ORE, money(121 * 198.5)),
    payslipLine('helgetillegg', 'Helgetillegg', 28, HELG_ORE_PER_HOUR, money(28 * 45)),
  ];

  /* --------------------------------------------------------------- juli 2026 */
  // Feil 5: de 2 timene over 9 t onsdag 15. juli er betalt som ordinære timer, uten
  //         overtidstillegg — det finnes ingen overtidslinje.
  // Feil 6: bare 92,0 av 94,5 jobbede timer er betalt.
  const juli: PayslipLine[] = [
    payslipLine('ordinaer', 'Timelønn', 92, DEMO_HOURLY_RATE_ORE, money(92 * 198.5)),
    payslipLine('kveldstillegg', 'Kveldstillegg', 50, KVELD_ORE_PER_HOUR, money(50 * 25)),
    payslipLine('helgetillegg', 'Helgetillegg', 22.5, HELG_ORE_PER_HOUR, money(22.5 * 45)),
  ];

  const sum = (lines: PayslipLine[]) => lines.reduce((total, line) => total + line.amountOre, 0);

  return [
    {
      id: 'demo-slipp-2026-05',
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
      lines: mai,
      grossOre: sum(mai),
      feriepengerBasisOre: null,
      feriepengerAccruedOre: null,
      documentRef: slipRef('demo-slipp-mai', 'Lønnsslipp mai 2026.pdf'),
    },
    {
      id: 'demo-slipp-2026-06',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      lines: juni,
      grossOre: sum(juni),
      feriepengerBasisOre: null,
      feriepengerAccruedOre: null,
      documentRef: slipRef('demo-slipp-juni', 'Lønnsslipp juni 2026.pdf'),
    },
    {
      id: 'demo-slipp-2026-07',
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
      lines: juli,
      grossOre: sum(juli),
      // Feil 8: 10,2 % av 65 000,00 kr er 6 630,00 kr, ikke 6 000,00 kr.
      feriepengerBasisOre: money(65_000),
      feriepengerAccruedOre: money(6_000),
      documentRef: slipRef('demo-slipp-juli', 'Lønnsslipp juli 2026.pdf'),
    },
  ];
}

function demoDocuments(): StoredDocument[] {
  return [
    {
      id: KONTRAKT_DOC_ID,
      name: 'Arbeidsavtale Kafé Nordlys AS.pdf',
      kind: 'kontrakt',
      pageCount: 3,
      addedAt: '2026-09-01T09:00:00.000Z',
      maskedTextPreview:
        'ARBEIDSAVTALE\nArbeidsgiver: Kafé Nordlys AS\nArbeidstaker: Kari Nordmann\n' +
        'Fødselsnummer: ***********\nStilling: Servitør, 60 %\nTimelønn: kr 198,50\n' +
        'Tillegg: kveldstillegg kr 25,00 etter kl. 18.00, helgetillegg kr 45,00 lørdag og søndag.',
    },
    {
      id: VAKTPLAN_DOC_ID,
      name: 'Vaktplan mai–juli 2026 (eksport fra vaktsystem).csv',
      kind: 'vaktplan',
      pageCount: 3,
      addedAt: '2026-09-01T09:05:00.000Z',
      maskedTextPreview: 'dato;start;slutt;pause\n2026-05-04;17:00;22:00;0\n2026-05-05;17:00;22:00;0 …',
    },
    {
      id: 'demo-slipp-mai',
      name: 'Lønnsslipp mai 2026.pdf',
      kind: 'lonnsslipp',
      pageCount: 1,
      addedAt: '2026-09-01T09:10:00.000Z',
      maskedTextPreview: 'Lønnsslipp mai 2026\nKonto: **********\nTimelønn 110,00 × 185,00 = 20 350,00',
    },
    {
      id: 'demo-slipp-juni',
      name: 'Lønnsslipp juni 2026.pdf',
      kind: 'lonnsslipp',
      pageCount: 1,
      addedAt: '2026-09-01T09:11:00.000Z',
      maskedTextPreview: 'Lønnsslipp juni 2026\nKonto: **********\nTimelønn 121,00 × 198,50 = 24 018,50',
    },
    {
      id: 'demo-slipp-juli',
      name: 'Lønnsslipp juli 2026.pdf',
      kind: 'lonnsslipp',
      pageCount: 1,
      addedAt: '2026-09-01T09:12:00.000Z',
      maskedTextPreview: 'Lønnsslipp juli 2026\nKonto: **********\nTimelønn 92,00 × 198,50 = 18 262,00',
    },
  ];
}

export function demoWorkspace(now = '2026-09-21T10:00:00.000Z'): Workspace {
  return Workspace.parse({
    version: 1,
    contract: demoContract(),
    shifts: demoShifts(),
    payslips: demoPayslips(),
    documents: demoDocuments(),
    ruleOverrides: {},
    settings: { fullTimeHoursPerWeek: 37.5 },
    createdAt: now,
    updatedAt: now,
  });
}
