/**
 * Roll-ups the rules are built on: hours per day, per ISO week, per month and per payslip
 * period, plus what a payslip actually paid.
 *
 * Nothing here decides whether something is wrong. It only counts, and it counts from
 * per-calendar-day shift segments so that a shift crossing midnight or a pay-period
 * boundary lands in the right bucket.
 */
import { isHoliday } from './holidays';
import type { DateStr, Payslip, PayslipCategory, Shift, Supplement } from './schemas';
import { OVERTIME_CATEGORIES, WORK_HOUR_CATEGORIES } from './schemas';
import {
  addDays,
  isoWeek,
  isoWeekEnd,
  isoWeekKey,
  isoWeekLabel,
  isoWeekStart,
  isWeekend,
  isWithin,
  monthEnd,
  monthKey,
  monthLabel,
  monthStart,
  parseIsoWeekKey,
  parseTime,
  shiftSegments,
  weekdayIso,
  windowOverlapMinutes,
  type ShiftSegment,
} from './time';

export interface SegmentWithShift extends ShiftSegment {
  shift: Shift;
}

/**
 * The shifts a check should be based on.
 *
 * If any hours are registered as actually worked (`jobbet`) on a date, those replace the
 * planned shifts for that date — you were there, so that is the truth. Dates with only
 * planned shifts keep the plan.
 */
export function effectiveShifts(shifts: readonly Shift[]): Shift[] {
  const datesWithWorked = new Set(shifts.filter((s) => s.kind === 'jobbet').map((s) => s.date));
  return shifts.filter((shift) => shift.kind === 'jobbet' || !datesWithWorked.has(shift.date));
}

export function plannedShifts(shifts: readonly Shift[]): Shift[] {
  return shifts.filter((shift) => shift.kind === 'planlagt');
}

export function segmentsOf(shifts: readonly Shift[]): SegmentWithShift[] {
  return shifts
    .flatMap((shift) => shiftSegments(shift).map((segment) => ({ ...segment, shift })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
}

export function minutesInRange(
  segments: readonly SegmentWithShift[],
  start: DateStr,
  end: DateStr,
): number {
  return segments
    .filter((segment) => isWithin(segment.date, start, end))
    .reduce((sum, segment) => sum + segment.workedMinutes, 0);
}

export function hoursInRange(
  segments: readonly SegmentWithShift[],
  start: DateStr,
  end: DateStr,
): number {
  return minutesInRange(segments, start, end) / 60;
}

/* ------------------------------------------------------------------ buckets */

export interface Bucket {
  key: string;
  label: string;
  start: DateStr;
  end: DateStr;
  plannedHours: number;
  workedHours: number;
  dates: DateStr[];
}

function bucketize(
  shifts: readonly Shift[],
  keyOf: (date: DateStr) => string,
  rangeOf: (key: string) => { start: DateStr; end: DateStr; label: string },
  next: (key: string) => string,
  span: { start: DateStr; end: DateStr } | null,
): Bucket[] {
  const planned = segmentsOf(plannedShifts(shifts));
  const effective = segmentsOf(effectiveShifts(shifts));

  const keys = new Set<string>();
  for (const segment of [...planned, ...effective]) keys.add(keyOf(segment.date));

  // Weeks and months with no shifts at all still get a bucket, as long as they lie inside
  // the span we have data for. A week where you were given no hours is exactly the kind of
  // week a worker needs to see.
  if (span) {
    let key = keyOf(span.start);
    const lastKey = keyOf(span.end);
    for (let guard = 0; guard < 600; guard += 1) {
      keys.add(key);
      if (key === lastKey) break;
      key = next(key);
    }
  }

  return [...keys]
    .sort()
    .map((key) => {
      const range = rangeOf(key);
      const inPlanned = planned.filter((s) => keyOf(s.date) === key);
      const inEffective = effective.filter((s) => keyOf(s.date) === key);
      return {
        key,
        label: range.label,
        start: range.start,
        end: range.end,
        plannedHours: inPlanned.reduce((sum, s) => sum + s.workedMinutes, 0) / 60,
        workedHours: inEffective.reduce((sum, s) => sum + s.workedMinutes, 0) / 60,
        dates: [...new Set(inEffective.map((s) => s.date))].sort(),
      };
    });
}

export function weekBuckets(
  shifts: readonly Shift[],
  span: { start: DateStr; end: DateStr } | null = null,
): Bucket[] {
  return bucketize(
    shifts,
    (date) => isoWeekKey(isoWeek(date)),
    (key) => {
      const week = parseIsoWeekKey(key);
      return { start: isoWeekStart(week), end: isoWeekEnd(week), label: isoWeekLabel(week) };
    },
    (key) => isoWeekKey(isoWeek(addDays(isoWeekStart(parseIsoWeekKey(key)), 7))),
    span,
  );
}

export function monthBuckets(
  shifts: readonly Shift[],
  span: { start: DateStr; end: DateStr } | null = null,
): Bucket[] {
  return bucketize(
    shifts,
    (date) => monthKey(date),
    (key) => ({ start: monthStart(key), end: monthEnd(key), label: monthLabel(key) }),
    (key) => monthKey(addDays(monthEnd(key), 1)),
    span,
  );
}

/* ----------------------------------------------------------------- payslips */

export interface CategoryTotal {
  hours: number;
  amountOre: number;
  rateOre: number | null;
  labels: string[];
}

export interface PayslipSummary {
  payslip: Payslip;
  label: string;
  /** Hours paid in work-hour categories only (supplement lines are money on the same hours). */
  paidWorkHours: number;
  paidOvertimeHours: number;
  byCategory: Map<PayslipCategory, CategoryTotal>;
  grossOre: number;
  /** Sum of all line amounts, which may differ from a stated gross. */
  linesTotalOre: number;
}

export function payslipLabel(payslip: Payslip): string {
  if (payslip.periodStart.slice(0, 7) === payslip.periodEnd.slice(0, 7)) {
    const sameMonth = monthLabel(monthKey(payslip.periodStart));
    if (payslip.periodStart === monthStart(monthKey(payslip.periodStart)) &&
        payslip.periodEnd === monthEnd(monthKey(payslip.periodEnd))) {
      return `Lønn for ${sameMonth}`;
    }
  }
  return `Lønn for ${payslip.periodStart} – ${payslip.periodEnd}`;
}

export function payslipSummary(payslip: Payslip): PayslipSummary {
  const byCategory = new Map<PayslipCategory, CategoryTotal>();

  for (const line of payslip.lines) {
    const current = byCategory.get(line.category) ?? { hours: 0, amountOre: 0, rateOre: null, labels: [] };
    current.hours += line.hours ?? 0;
    current.amountOre += line.amountOre;
    if (current.rateOre === null && line.rateOre !== null) current.rateOre = line.rateOre;
    current.labels.push(line.label);
    byCategory.set(line.category, current);
  }

  const sumHours = (categories: readonly PayslipCategory[]) =>
    categories.reduce((sum, category) => sum + (byCategory.get(category)?.hours ?? 0), 0);

  const linesTotalOre = payslip.lines.reduce((sum, line) => sum + line.amountOre, 0);

  return {
    payslip,
    label: payslipLabel(payslip),
    paidWorkHours: sumHours(WORK_HOUR_CATEGORIES),
    paidOvertimeHours: sumHours(OVERTIME_CATEGORIES),
    byCategory,
    grossOre: payslip.grossOre ?? linesTotalOre,
    linesTotalOre,
  };
}

export function categoryHours(summary: PayslipSummary, category: PayslipCategory): number {
  return summary.byCategory.get(category)?.hours ?? 0;
}

export function categoryAmountOre(summary: PayslipSummary, category: PayslipCategory): number {
  return summary.byCategory.get(category)?.amountOre ?? 0;
}

/* -------------------------------------------------------------- supplements */

/**
 * Hours worked inside a supplement's time window.
 *
 * The window overlap is measured on the segment's clock span, then scaled by the segment's
 * worked share so a registered break does not get paid a supplement. The break is assumed
 * spread evenly across the shift — see DECISIONS.md.
 */
export function supplementHours(
  segments: readonly SegmentWithShift[],
  supplement: Supplement,
  start: DateStr,
  end: DateStr,
): number {
  let minutes = 0;

  for (const segment of segments) {
    if (!isWithin(segment.date, start, end)) continue;
    if (supplement.kind === 'helligdag' && !isHoliday(segment.date)) continue;
    if (supplement.weekdays !== null) {
      if (!supplement.weekdays.includes(weekdayIso(segment.date))) continue;
    } else if (supplement.kind === 'helg' && !isWeekend(segment.date)) {
      continue;
    }

    const overlap =
      supplement.fromTime !== null && supplement.toTime !== null
        ? windowOverlapMinutes(segment, parseTime(supplement.fromTime), parseTime(supplement.toTime))
        : segment.grossMinutes;

    if (overlap <= 0) continue;
    const workedShare = segment.grossMinutes > 0 ? segment.workedMinutes / segment.grossMinutes : 0;
    minutes += overlap * workedShare;
  }

  return minutes / 60;
}

/** Hours worked on a public holiday within a range. */
export function holidayHours(
  segments: readonly SegmentWithShift[],
  start: DateStr,
  end: DateStr,
): number {
  return (
    segments
      .filter((segment) => isWithin(segment.date, start, end) && isHoliday(segment.date))
      .reduce((sum, segment) => sum + segment.workedMinutes, 0) / 60
  );
}

/** The payslips whose period overlaps a date range. */
export function payslipsOverlapping(
  payslips: readonly Payslip[],
  start: DateStr,
  end: DateStr,
): Payslip[] {
  return payslips.filter((payslip) => payslip.periodStart <= end && payslip.periodEnd >= start);
}

/** A payslip covering exactly this range, if one exists (e.g. a weekly payslip for a week). */
export function payslipCovering(
  payslips: readonly Payslip[],
  start: DateStr,
  end: DateStr,
): Payslip | null {
  return payslips.find((p) => p.periodStart === start && p.periodEnd === end) ?? null;
}
