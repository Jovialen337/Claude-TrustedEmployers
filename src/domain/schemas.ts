/**
 * Single source of truth for the data model.
 *
 * Every value that crosses a boundary (AI extraction, HTTP body, stored JSON file,
 * rules file on disk) is parsed through these schemas first. Money is always integer
 * øre so that no sum in this app ever depends on floating point cents.
 */
import { z } from 'zod';

export const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dato må være på formen YYYY-MM-DD');
export const TimeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Klokkeslett må være på formen HH:MM');

/** Integer øre. 198,50 kr === 19850. */
export const Ore = z.number().int();

export const DOCUMENT_KINDS = ['kontrakt', 'vaktplan', 'lonnsslipp'] as const;
export const DocumentKind = z.enum(DOCUMENT_KINDS);

export const DocumentRef = z.object({
  docId: z.string(),
  docName: z.string(),
  page: z.number().int().positive().nullable().default(null),
  kind: DocumentKind,
});

export const StoredDocument = z.object({
  id: z.string(),
  name: z.string(),
  kind: DocumentKind,
  pageCount: z.number().int().nonnegative().nullable().default(null),
  addedAt: z.string(),
  /** Extracted, PII-masked text kept locally so the user can see what was read. */
  maskedTextPreview: z.string().nullable().default(null),
});

/* ------------------------------------------------------------------ contract */

export const SUPPLEMENT_KINDS = ['kveld', 'natt', 'helg', 'helligdag'] as const;
export const SupplementKind = z.enum(SUPPLEMENT_KINDS);

export const SupplementRate = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('per_hour_ore'), value: Ore.nonnegative() }),
  z.object({ kind: z.literal('percent'), value: z.number().nonnegative() }),
]);

/**
 * Supplements (kveld-/natt-/helg-/helligdagstillegg) follow from the contract or the
 * tariff agreement — never from the law. They are therefore always user data, and the
 * default ruleset ships no rates for them.
 */
export const Supplement = z.object({
  id: z.string(),
  label: z.string(),
  kind: SupplementKind,
  fromTime: TimeStr.nullable().default(null),
  toTime: TimeStr.nullable().default(null),
  weekdays: z.array(z.number().int().min(1).max(7)).nullable().default(null),
  rate: SupplementRate,
  source: z.string(),
});

export const Wage = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hourly'), amountOre: Ore.nonnegative() }),
  z.object({ kind: z.literal('monthly'), amountOre: Ore.nonnegative() }),
]);

/**
 * The contract is the primary source for every rule.
 *
 * Each field below that the law also speaks to is nullable: `null` means "the contract does
 * not say", and only then does the statutory default from the ruleset apply. Where the law
 * sets a floor the contract cannot go under (the 40 % overtime supplement, 8 hours of daily
 * rest, a 30 minute break on a long day), a weaker contract term is raised to the floor and
 * reported as its own finding — see derive.ts.
 */
export const Contract = z.object({
  id: z.string(),
  employer: z.string(),
  employeeName: z.string(),
  startDate: DateStr,
  endDate: DateStr.nullable().default(null),
  stillingsprosent: z.number().min(0).max(100),
  fullTimeHoursPerWeek: z.number().positive(),
  contractedHoursPerWeek: z.number().positive().nullable().default(null),
  wage: Wage,
  tariffavtale: z.string().nullable().default(null),
  averagingAgreement: z.boolean().default(false),

  /* Avtalt arbeidstid og overtid (AML § 10-4, § 10-5, § 10-6) */
  normalDailyLimitHours: z.number().positive().nullable().default(null),
  normalWeeklyLimitHours: z.number().positive().nullable().default(null),
  overtimeSupplementPercent: z.number().nonnegative().nullable().default(null),
  maxOvertimeHoursPer7Days: z.number().nonnegative().nullable().default(null),
  maxOvertimeHoursPer4Weeks: z.number().nonnegative().nullable().default(null),
  maxOvertimeHoursPer52Weeks: z.number().nonnegative().nullable().default(null),

  /* Avtalt arbeidsfri (AML § 10-8) */
  agreedDailyRestHours: z.number().positive().nullable().default(null),
  agreedWeeklyRestHours: z.number().positive().nullable().default(null),

  /* Avtalte pauser (AML § 10-9) */
  breakRequiredAfterHours: z.number().positive().nullable().default(null),
  longDayHours: z.number().positive().nullable().default(null),
  minBreakMinutesLongDay: z.number().nonnegative().nullable().default(null),
  /** Regnes pausen som arbeidstid? Da teller den som timer du skal ha betalt for. */
  paidBreak: z.boolean().default(false),

  /* Rett til større stilling (AML § 14-4 a) */
  largerPositionLookbackMonths: z.number().positive().nullable().default(null),

  /** null = kontrakten sier ingenting, og ferielovens sats brukes. */
  feriepengerRatePercent: z.number().nonnegative().nullable().default(null),
  supplements: z.array(Supplement).default([]),
  documentRef: DocumentRef.nullable().default(null),
});

/* --------------------------------------------------------------------- shift */

export const SHIFT_KINDS = ['planlagt', 'jobbet'] as const;
export const ShiftKind = z.enum(SHIFT_KINDS);

/**
 * Every agreed term left unsaid. Spread this when building a contract so that adding a new
 * agreed term cannot silently leave existing contracts, fixtures or the demo half-built.
 */
export const NO_AGREED_TERMS = {
  normalDailyLimitHours: null,
  normalWeeklyLimitHours: null,
  overtimeSupplementPercent: null,
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
  feriepengerRatePercent: null,
} as const;

export const Shift = z.object({
  id: z.string(),
  /** The date work STARTS. A shift whose end <= start crosses midnight. */
  date: DateStr,
  start: TimeStr,
  end: TimeStr,
  breakMinutes: z.number().int().nonnegative().default(0),
  kind: ShiftKind.default('planlagt'),
  source: z.enum(['manuell', 'import', 'ai']).default('manuell'),
  note: z.string().nullable().default(null),
  documentRef: DocumentRef.nullable().default(null),
});

/* ------------------------------------------------------------------- payslip */

/**
 * Only work-hour categories count towards "hours paid". Supplement categories are extra
 * money on hours that are already counted somewhere else, so summing them as hours would
 * double count. See WORK_HOUR_CATEGORIES / SUPPLEMENT_CATEGORIES below.
 */
export const PAYSLIP_CATEGORIES = [
  'ordinaer',
  'merarbeid',
  'overtid_40',
  'overtid_100',
  'helligdag_arbeid',
  'kveldstillegg',
  'nattillegg',
  'helgetillegg',
  'helligdagstillegg',
  'fastlonn',
  'feriepenger',
  'annet',
] as const;
export const PayslipCategory = z.enum(PAYSLIP_CATEGORIES);

export const WORK_HOUR_CATEGORIES = [
  'ordinaer',
  'merarbeid',
  'overtid_40',
  'overtid_100',
  'helligdag_arbeid',
] as const;

export const OVERTIME_CATEGORIES = ['overtid_40', 'overtid_100'] as const;

export const SUPPLEMENT_CATEGORY_BY_KIND: Record<SupplementKind, PayslipCategory> = {
  kveld: 'kveldstillegg',
  natt: 'nattillegg',
  helg: 'helgetillegg',
  helligdag: 'helligdagstillegg',
};

export const CATEGORY_LABELS: Record<PayslipCategory, string> = {
  ordinaer: 'Ordinære timer',
  merarbeid: 'Merarbeid',
  overtid_40: 'Overtid 40 %',
  overtid_100: 'Overtid 100 %',
  helligdag_arbeid: 'Arbeid på helligdag',
  kveldstillegg: 'Kveldstillegg',
  nattillegg: 'Nattillegg',
  helgetillegg: 'Helgetillegg',
  helligdagstillegg: 'Helligdagstillegg',
  fastlonn: 'Fastlønn',
  feriepenger: 'Feriepenger',
  annet: 'Annet',
};

export const PayslipLine = z.object({
  id: z.string(),
  category: PayslipCategory,
  /** The raw text as it appears on the payslip, so the user can recognise it. */
  label: z.string(),
  hours: z.number().nullable().default(null),
  rateOre: Ore.nullable().default(null),
  amountOre: Ore,
});

export const Payslip = z.object({
  id: z.string(),
  periodStart: DateStr,
  periodEnd: DateStr,
  lines: z.array(PayslipLine).default([]),
  grossOre: Ore.nullable().default(null),
  feriepengerBasisOre: Ore.nullable().default(null),
  feriepengerAccruedOre: Ore.nullable().default(null),
  documentRef: DocumentRef.nullable().default(null),
});

/* ------------------------------------------------------------------ rule set */

export const RULE_IDS = [
  'hours_vs_stillingsprosent',
  'overtime',
  'rest_periods',
  'breaks',
  'actual_hours_vs_contract',
  'scheduled_vs_paid',
  'supplements',
  'feriepenger',
] as const;
export const RuleId = z.enum(RULE_IDS);

export const SEVERITIES = ['sannsynlig_feil', 'bor_sjekkes', 'til_info'] as const;
export const Severity = z.enum(SEVERITIES);

export const SEVERITY_LABELS: Record<Severity, string> = {
  sannsynlig_feil: 'Sannsynlig feil',
  bor_sjekkes: 'Bør sjekkes',
  til_info: 'Til info',
};

/** Ordering used everywhere flags are listed: worst first. */
export const SEVERITY_ORDER: Record<Severity, number> = {
  sannsynlig_feil: 0,
  bor_sjekkes: 1,
  til_info: 2,
};

export const RuleSource = z.object({
  law: z.string(),
  paragraph: z.string(),
  url: z.string().nullable().default(null),
  note: z.string().nullable().default(null),
});

export const RuleParams = z.record(z.string(), z.union([z.number(), z.string(), z.boolean()]));

export const Rule = z.object({
  id: RuleId,
  enabled: z.boolean().default(true),
  title: z.string(),
  explanation: z.string(),
  severity: Severity,
  params: RuleParams.default({}),
  sources: z.array(RuleSource).default([]),
  verified: z.enum(['lovdata', 'sekundaerkilde', 'ikke_verifisert']).default('ikke_verifisert'),
});

export const RuleSet = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string(),
  jurisdiction: z.literal('NO'),
  fullTimeHoursPerWeek: z.number().positive(),
  rules: z.array(Rule),
});

export const RuleOverride = z.object({
  enabled: z.boolean().optional(),
  params: RuleParams.optional(),
});

/* ---------------------------------------------------------------------- flag */

export const Evidence = z.object({ label: z.string(), value: z.string() });

export const Calculation = z.object({
  /** Human-readable, e.g. "2,5 t × 198,50 kr = 496,25 kr". */
  expression: z.string(),
  resultOre: Ore.nullable().default(null),
});

export const Flag = z.object({
  id: z.string(),
  ruleId: RuleId,
  severity: Severity,
  title: z.string(),
  periodLabel: z.string(),
  periodStart: DateStr,
  periodEnd: DateStr,
  message: z.string(),
  evidence: z.array(Evidence).default([]),
  calculation: Calculation.nullable().default(null),
  amountOre: Ore.nullable().default(null),
  sources: z.array(RuleSource).default([]),
  documentRefs: z.array(DocumentRef).default([]),
});

/* ----------------------------------------------------------------- workspace */

export const Settings = z.object({
  fullTimeHoursPerWeek: z.number().positive().default(37.5),
});

export const Workspace = z.object({
  version: z.literal(1),
  contract: Contract.nullable().default(null),
  shifts: z.array(Shift).default([]),
  payslips: z.array(Payslip).default([]),
  documents: z.array(StoredDocument).default([]),
  ruleOverrides: z.partialRecord(RuleId, RuleOverride).default({}),
  settings: Settings.default({ fullTimeHoursPerWeek: 37.5 }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/* ---------------------------------------------------------------------- types */

export type DateStr = z.infer<typeof DateStr>;
export type TimeStr = z.infer<typeof TimeStr>;
export type DocumentKind = z.infer<typeof DocumentKind>;
export type DocumentRef = z.infer<typeof DocumentRef>;
export type StoredDocument = z.infer<typeof StoredDocument>;
export type SupplementKind = z.infer<typeof SupplementKind>;
export type SupplementRate = z.infer<typeof SupplementRate>;
export type Supplement = z.infer<typeof Supplement>;
export type Wage = z.infer<typeof Wage>;
export type Contract = z.infer<typeof Contract>;
export type ShiftKind = z.infer<typeof ShiftKind>;
export type Shift = z.infer<typeof Shift>;
export type PayslipCategory = z.infer<typeof PayslipCategory>;
export type PayslipLine = z.infer<typeof PayslipLine>;
export type Payslip = z.infer<typeof Payslip>;
export type RuleId = z.infer<typeof RuleId>;
export type Severity = z.infer<typeof Severity>;
export type RuleSource = z.infer<typeof RuleSource>;
export type RuleParams = z.infer<typeof RuleParams>;
export type Rule = z.infer<typeof Rule>;
export type RuleSet = z.infer<typeof RuleSet>;
export type RuleOverride = z.infer<typeof RuleOverride>;
export type Evidence = z.infer<typeof Evidence>;
export type Calculation = z.infer<typeof Calculation>;
export type Flag = z.infer<typeof Flag>;
export type Settings = z.infer<typeof Settings>;
export type Workspace = z.infer<typeof Workspace>;

export function emptyWorkspace(now = new Date().toISOString()): Workspace {
  return {
    version: 1,
    contract: null,
    shifts: [],
    payslips: [],
    documents: [],
    ruleOverrides: {},
    settings: { fullTimeHoursPerWeek: 37.5 },
    createdAt: now,
    updatedAt: now,
  };
}
