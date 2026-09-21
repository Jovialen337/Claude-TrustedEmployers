/**
 * What the model is allowed to return.
 *
 * These are deliberately separate from the domain schemas: the model returns plain numbers
 * in kroner and nothing else, and the mapping into the domain model (øre, ids, defaults) is
 * done by code. Anything that does not validate is rejected and re-asked, never patched up.
 */
import { z } from 'zod';

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

export const ExtractedSupplement = z.object({
  label: z.string(),
  kind: z.enum(['kveld', 'natt', 'helg', 'helligdag']),
  fromTime: nullableString,
  toTime: nullableString,
  rateKroner: nullableNumber,
  ratePercent: nullableNumber,
  source: nullableString,
});

export const ExtractedContract = z.object({
  employer: nullableString,
  employeeName: nullableString,
  startDate: nullableString,
  stillingsprosent: nullableNumber,
  fullTimeHoursPerWeek: nullableNumber,
  contractedHoursPerWeek: nullableNumber,
  wageKind: z.enum(['hourly', 'monthly']).nullable(),
  wageKroner: nullableNumber,
  tariffavtale: nullableString,
  /**
   * Terms the contract may set instead of the law. Each one defaults to null: a model that
   * leaves it out has said nothing about it, and the fallback to the statutory value is the
   * app's job, not the model's. Omitting these must not fail validation — that would waste a
   * retry on a document that simply does not mention overtime rates.
   */
  averagingAgreement: z.boolean().nullable().default(null),
  overtimeSupplementPercent: nullableNumber.default(null),
  normalDailyLimitHours: nullableNumber.default(null),
  normalWeeklyLimitHours: nullableNumber.default(null),
  agreedDailyRestHours: nullableNumber.default(null),
  agreedWeeklyRestHours: nullableNumber.default(null),
  breakRequiredAfterHours: nullableNumber.default(null),
  minBreakMinutesLongDay: nullableNumber.default(null),
  paidBreak: z.boolean().nullable().default(null),
  feriepengerRatePercent: nullableNumber.default(null),

  supplements: z.array(ExtractedSupplement),
  /** Anything the model was unsure about, shown to the user next to the fields. */
  notes: z.array(z.string()),
});

export const ExtractedPayslipLine = z.object({
  label: z.string(),
  category: z.enum([
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
  ]),
  hours: nullableNumber,
  rateKroner: nullableNumber,
  amountKroner: z.number(),
});

export const ExtractedPayslip = z.object({
  periodStart: nullableString,
  periodEnd: nullableString,
  lines: z.array(ExtractedPayslipLine),
  grossKroner: nullableNumber,
  feriepengerBasisKroner: nullableNumber,
  feriepengerAccruedKroner: nullableNumber,
  notes: z.array(z.string()),
});

export const ExtractedShift = z.object({
  date: z.string(),
  start: z.string(),
  end: z.string(),
  breakMinutes: nullableNumber,
});

export const ExtractedSchedule = z.object({
  shifts: z.array(ExtractedShift),
  kind: z.enum(['planlagt', 'jobbet']).nullable(),
  notes: z.array(z.string()),
});

export type ExtractedContract = z.infer<typeof ExtractedContract>;
export type ExtractedPayslip = z.infer<typeof ExtractedPayslip>;
export type ExtractedSchedule = z.infer<typeof ExtractedSchedule>;
export type ExtractedSupplement = z.infer<typeof ExtractedSupplement>;
export type ExtractedPayslipLine = z.infer<typeof ExtractedPayslipLine>;
export type ExtractedShift = z.infer<typeof ExtractedShift>;

export const EXTRACTION_KINDS = ['kontrakt', 'lonnsslipp', 'vaktplan'] as const;
export type ExtractionKind = (typeof EXTRACTION_KINDS)[number];
