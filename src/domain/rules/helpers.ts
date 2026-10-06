/** Small shared helpers for writing rules: flag construction, params, evidence. */
import { formatHours, formatKr, hoursTimesRate } from '../money';
import type { DateStr, DocumentRef, Evidence, Flag, Payslip, Rule, Severity, Shift } from '../schemas';
import type { Bucket, SegmentWithShift } from '../aggregate';
import type { RuleContext } from './types';

export function numberParam(rule: Rule, key: string, fallback: number): number {
  const value = rule.params[key];
  return typeof value === 'number' ? value : fallback;
}

export interface FlagInput {
  key: string;
  severity?: Severity;
  title: string;
  periodLabel: string;
  periodStart: DateStr;
  periodEnd: DateStr;
  message: string;
  evidence?: Evidence[];
  calculation?: { expression: string; resultOre: number | null } | null;
  amountOre?: number | null;
  documentRefs?: DocumentRef[];
}

/** Build a flag, filling in the rule's id, default severity and legal sources. */
export function buildFlag(context: RuleContext, input: FlagInput): Flag {
  return {
    id: `${context.rule.id}:${input.key}`,
    ruleId: context.rule.id,
    severity: input.severity ?? context.rule.severity,
    title: input.title,
    periodLabel: input.periodLabel,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    message: input.message,
    evidence: input.evidence ?? [],
    calculation: input.calculation ?? null,
    amountOre: input.amountOre ?? null,
    sources: context.rule.sources,
    documentRefs: input.documentRefs ?? [],
  };
}

export function ev(label: string, value: string): Evidence {
  return { label, value };
}

/** "2,5 t × 198,50 kr = 496,25 kr" — the calculation shown next to a money amount. */
export function hoursTimesRateCalculation(
  hours: number,
  rateOre: number,
  options: { suffix?: string; factor?: number; factorLabel?: string } = {},
): { expression: string; resultOre: number } {
  const base = hoursTimesRate(hours, rateOre);
  const resultOre = options.factor === undefined ? base : Math.round(base * options.factor);
  const factorPart = options.factorLabel === undefined ? '' : ` × ${options.factorLabel}`;
  return {
    expression: `${formatHours(hours)} × ${formatKr(rateOre)}${factorPart} = ${formatKr(resultOre)}${options.suffix ?? ''}`,
    resultOre,
  };
}

export function refsFromShifts(shifts: readonly Shift[]): DocumentRef[] {
  const seen = new Map<string, DocumentRef>();
  for (const shift of shifts) {
    if (shift.documentRef) seen.set(`${shift.documentRef.docId}:${shift.documentRef.page ?? ''}`, shift.documentRef);
  }
  return [...seen.values()];
}

export function refsFromSegments(segments: readonly SegmentWithShift[]): DocumentRef[] {
  return refsFromShifts(segments.map((segment) => segment.shift));
}

export function refsFromPayslip(payslip: Payslip): DocumentRef[] {
  return payslip.documentRef ? [payslip.documentRef] : [];
}

export function contractRef(context: RuleContext): DocumentRef[] {
  return context.contract.documentRef ? [context.contract.documentRef] : [];
}

/** Whole weeks/months only: a bucket that sticks out past the data we have is skipped. */
export function isComplete(bucket: Bucket, range: { start: DateStr; end: DateStr } | null): boolean {
  if (!range) return false;
  return bucket.start >= range.start && bucket.end <= range.end;
}

/** Contracted hours for an arbitrary number of days, pro rata from the weekly figure. */
export function contractedHoursForDays(weeklyHours: number, days: number): number {
  return (weeklyHours * days) / 7;
}
