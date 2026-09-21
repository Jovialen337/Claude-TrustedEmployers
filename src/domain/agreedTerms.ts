/**
 * Reading the contract's agreed terms out of what the user typed.
 *
 * Kept out of the page so it can be tested: the difference between "the contract says
 * nothing" (blank → null → the law applies) and "this is not a number" (an error the user
 * must see) is exactly the kind of thing that is easy to get subtly wrong.
 */
import { parseHoursInput } from './money';

export const AGREED_TERM_KEYS = [
  'feriepengerRatePercent',
  'overtimeSupplementPercent',
  'normalDailyLimitHours',
  'normalWeeklyLimitHours',
  'maxOvertimeHoursPer7Days',
  'agreedDailyRestHours',
  'agreedWeeklyRestHours',
  'breakRequiredAfterHours',
  'minBreakMinutesLongDay',
  'largerPositionLookbackMonths',
] as const;

export type AgreedTermKey = (typeof AGREED_TERM_KEYS)[number];

export type AgreedTermInput = Record<AgreedTermKey, string>;
export type AgreedTermValues = Record<AgreedTermKey, number | null>;

export interface ParsedAgreedTerms {
  values: AgreedTermValues;
  /** Fields the user filled in with something that is not a number. */
  invalid: AgreedTermKey[];
}

/** Norwegian labels, for the error message and for the settings screen. */
export const AGREED_TERM_LABELS: Record<AgreedTermKey, string> = {
  feriepengerRatePercent: 'feriepengesats',
  overtimeSupplementPercent: 'overtidstillegg',
  normalDailyLimitHours: 'alminnelig arbeidstid per døgn',
  normalWeeklyLimitHours: 'alminnelig arbeidstid per uke',
  maxOvertimeHoursPer7Days: 'maks overtid per sju dager',
  agreedDailyRestHours: 'arbeidsfri per døgn',
  agreedWeeklyRestHours: 'arbeidsfri per uke',
  breakRequiredAfterHours: 'pause etter',
  minBreakMinutesLongDay: 'minste pause på lang vakt',
  largerPositionLookbackMonths: 'perioden for rett til større stilling',
};

export function parseAgreedTerms(input: AgreedTermInput): ParsedAgreedTerms {
  const values = {} as AgreedTermValues;
  const invalid: AgreedTermKey[] = [];

  for (const key of AGREED_TERM_KEYS) {
    const raw = (input[key] ?? '').trim();
    if (raw === '') {
      // Not stated in the contract. The rule falls back to the law.
      values[key] = null;
      continue;
    }
    const parsed = parseHoursInput(raw);
    if (parsed === null || parsed < 0) {
      invalid.push(key);
      values[key] = null;
      continue;
    }
    values[key] = parsed;
  }

  return { values, invalid };
}

export function describeInvalidTerms(invalid: readonly AgreedTermKey[]): string {
  const names = invalid.map((key) => AGREED_TERM_LABELS[key]).join(', ');
  return `Dette er ikke et tall: ${names}. Bruk komma for desimaler, eller la feltet stå tomt hvis kontrakten ikke sier noe.`;
}
