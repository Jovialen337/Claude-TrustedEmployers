/**
 * Hand-made fixtures for the rules tests. Fake data only: fake name, fake employer,
 * no personnummer and no account numbers anywhere.
 */
import { runCheck } from '@/domain/engine';
import type {
  Contract,
  Payslip,
  PayslipCategory,
  PayslipLine,
  RuleId,
  Shift,
  Supplement,
  Workspace,
} from '@/domain/schemas';

export const HOURLY_RATE_ORE = 19850; // 198,50 kr

export function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'kontrakt-1',
    employer: 'Kafé Nordlys AS',
    employeeName: 'Kari Testesen',
    startDate: '2025-06-01',
    endDate: null,
    stillingsprosent: 50,
    fullTimeHoursPerWeek: 37.5,
    contractedHoursPerWeek: null,
    wage: { kind: 'hourly', amountOre: HOURLY_RATE_ORE },
    tariffavtale: null,
    averagingAgreement: false,
    normalDailyLimitHours: null,
    normalWeeklyLimitHours: null,
    feriepengerRatePercent: 10.2,
    supplements: [],
    documentRef: null,
    ...overrides,
  };
}

let shiftCounter = 0;

export function shift(
  date: string,
  start: string,
  end: string,
  options: Partial<Shift> = {},
): Shift {
  shiftCounter += 1;
  return {
    id: options.id ?? `vakt-${shiftCounter}`,
    date,
    start,
    end,
    breakMinutes: options.breakMinutes ?? 0,
    kind: options.kind ?? 'planlagt',
    source: options.source ?? 'manuell',
    note: options.note ?? null,
    documentRef: options.documentRef ?? null,
  };
}

let lineCounter = 0;

export function line(
  category: PayslipCategory,
  hours: number | null,
  rateOre: number | null,
  amountOre: number,
  label?: string,
): PayslipLine {
  lineCounter += 1;
  return {
    id: `linje-${lineCounter}`,
    category,
    label: label ?? category,
    hours,
    rateOre,
    amountOre,
  };
}

/** A payslip line for `hours` ordinary hours at the standard fixture rate. */
export function ordinaryLine(hours: number, rateOre = HOURLY_RATE_ORE): PayslipLine {
  return line('ordinaer', hours, rateOre, Math.round(hours * rateOre), 'Timelønn');
}

export function payslip(
  periodStart: string,
  periodEnd: string,
  lines: PayslipLine[],
  overrides: Partial<Payslip> = {},
): Payslip {
  return {
    id: overrides.id ?? `lonnsslipp-${periodStart}`,
    periodStart,
    periodEnd,
    lines,
    grossOre: overrides.grossOre ?? null,
    feriepengerBasisOre: overrides.feriepengerBasisOre ?? null,
    feriepengerAccruedOre: overrides.feriepengerAccruedOre ?? null,
    documentRef: overrides.documentRef ?? null,
  };
}

/** Spread, not `??`, so an explicitly passed `null` window survives. */
export function supplement(overrides: Partial<Supplement> = {}): Supplement {
  return {
    id: 'tillegg-1',
    label: 'Kveldstillegg etter kl. 18',
    kind: 'kveld',
    fromTime: '18:00',
    toTime: '00:00',
    weekdays: null,
    rate: { kind: 'per_hour_ore', value: 2500 },
    source: 'Arbeidskontrakt pkt. 5',
    ...overrides,
  };
}

export function workspace(parts: {
  contract?: Contract | null;
  shifts?: Shift[];
  payslips?: Payslip[];
  ruleOverrides?: Workspace['ruleOverrides'];
}): Workspace {
  return {
    version: 1,
    contract: parts.contract === undefined ? contract() : parts.contract,
    shifts: parts.shifts ?? [],
    payslips: parts.payslips ?? [],
    documents: [],
    ruleOverrides: parts.ruleOverrides ?? {},
    settings: { fullTimeHoursPerWeek: 37.5 },
    createdAt: '2026-09-21T00:00:00.000Z',
    updatedAt: '2026-09-21T00:00:00.000Z',
  };
}

/** Run a check with a fixed clock so results are byte-for-byte reproducible. */
export function check(parts: Parameters<typeof workspace>[0]) {
  return runCheck(workspace(parts), { now: '2026-09-21T12:00:00.000Z' });
}

export function flagsFor(result: ReturnType<typeof runCheck>, ruleId: RuleId) {
  return result.flags.filter((flag) => flag.ruleId === ruleId);
}
