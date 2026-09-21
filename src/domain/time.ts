/**
 * Date and clock helpers.
 *
 * Everything is computed on UTC epoch days and minutes-since-midnight, never on local
 * time, so a check produces the same result on a laptop in Oslo and on a CI runner in UTC.
 *
 * Two concepts matter for the rules:
 *  - a shift may cross midnight (end <= start), so it is split into per-calendar-day
 *    segments before anything is summed per day, week or pay period;
 *  - "9 timer per 24 timer" (AML § 10-4) is measured over an *arbeidsdøgn*: a 24 hour
 *    window that starts when work starts, not over a calendar day.
 */
import type { DateStr, Shift, TimeStr } from './schemas';

export const MINUTES_PER_DAY = 1440;

export function parseTime(time: TimeStr): number {
  const hours = Number(time.slice(0, 2));
  const minutes = Number(time.slice(3, 5));
  return hours * 60 + minutes;
}

export function formatTime(minutesSinceMidnight: number): TimeStr {
  const m = ((minutesSinceMidnight % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function toEpochDay(date: DateStr): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function fromEpochDay(epochDay: number): DateStr {
  const d = new Date(epochDay * 86_400_000);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(date: DateStr, days: number): DateStr {
  return fromEpochDay(toEpochDay(date) + days);
}

export function daysBetween(from: DateStr, to: DateStr): number {
  return toEpochDay(to) - toEpochDay(from);
}

export function compareDates(a: DateStr, b: DateStr): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isWithin(date: DateStr, start: DateStr, end: DateStr): boolean {
  return date >= start && date <= end;
}

/** ISO-8601 weekday: 1 = Monday … 7 = Sunday. */
export function weekdayIso(date: DateStr): number {
  const jsDay = new Date(toEpochDay(date) * 86_400_000).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

export function isWeekend(date: DateStr): boolean {
  return weekdayIso(date) >= 6;
}

export interface IsoWeek {
  year: number;
  week: number;
}

export function isoWeek(date: DateStr): IsoWeek {
  const epochDay = toEpochDay(date);
  // The ISO week of a date is the week containing the Thursday of that date's week.
  const thursday = epochDay + (4 - weekdayIso(date));
  const year = new Date(thursday * 86_400_000).getUTCFullYear();
  const firstThursdayWeekStart = isoWeekStart({ year, week: 1 });
  return { year, week: Math.floor((thursday - toEpochDay(firstThursdayWeekStart)) / 7) + 1 };
}

/** Monday of the given ISO week. */
export function isoWeekStart(week: IsoWeek): DateStr {
  const jan4 = `${week.year}-01-04` as DateStr;
  const week1Monday = toEpochDay(jan4) - (weekdayIso(jan4) - 1);
  return fromEpochDay(week1Monday + (week.week - 1) * 7);
}

export function isoWeekEnd(week: IsoWeek): DateStr {
  return addDays(isoWeekStart(week), 6);
}

/** "2026-W34" — sorts chronologically as a string. */
export function isoWeekKey(week: IsoWeek): string {
  return `${week.year}-W${String(week.week).padStart(2, '0')}`;
}

export function parseIsoWeekKey(key: string): IsoWeek {
  return { year: Number(key.slice(0, 4)), week: Number(key.slice(6)) };
}

export function isoWeekLabel(week: IsoWeek): string {
  return `Uke ${week.week} ${week.year}`;
}

export const WEEKDAY_NAMES = [
  'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag',
] as const;

export const MONTH_NAMES = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
] as const;

/** "fredag 21. august 2026" */
export function formatDateLong(date: DateStr): string {
  const weekday = WEEKDAY_NAMES[weekdayIso(date) - 1] ?? '';
  const day = Number(date.slice(8, 10));
  const month = MONTH_NAMES[Number(date.slice(5, 7)) - 1] ?? '';
  return `${weekday} ${day}. ${month} ${date.slice(0, 4)}`;
}

/** "21.08.2026" */
export function formatDateShort(date: DateStr): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`;
}

/** "2026-08" */
export function monthKey(date: DateStr): string {
  return date.slice(0, 7);
}

export function monthLabel(key: string): string {
  const monthIndex = Number(key.slice(5, 7)) - 1;
  return `${MONTH_NAMES[monthIndex] ?? key} ${key.slice(0, 4)}`;
}

export function monthStart(key: string): DateStr {
  return `${key}-01`;
}

export function monthEnd(key: string): DateStr {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const nextMonthFirst = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return addDays(nextMonthFirst as DateStr, -1);
}

/* ------------------------------------------------------------------- shifts */

/** Gross length of a shift in minutes, break included. Handles crossing midnight. */
export function shiftGrossMinutes(shift: Pick<Shift, 'start' | 'end'>): number {
  const start = parseTime(shift.start);
  const end = parseTime(shift.end);
  return end > start ? end - start : end + MINUTES_PER_DAY - start;
}

/** Paid/worked length: gross minus the registered break. Never negative. */
export function shiftWorkedMinutes(shift: Pick<Shift, 'start' | 'end' | 'breakMinutes'>): number {
  return Math.max(0, shiftGrossMinutes(shift) - shift.breakMinutes);
}

export function shiftWorkedHours(shift: Pick<Shift, 'start' | 'end' | 'breakMinutes'>): number {
  return shiftWorkedMinutes(shift) / 60;
}

/** Absolute start of a shift, in minutes since the epoch. */
export function shiftStartInstant(shift: Pick<Shift, 'date' | 'start'>): number {
  return toEpochDay(shift.date) * MINUTES_PER_DAY + parseTime(shift.start);
}

export function shiftEndInstant(shift: Pick<Shift, 'date' | 'start' | 'end'>): number {
  return shiftStartInstant(shift) + shiftGrossMinutes(shift);
}

export function crossesMidnight(shift: Pick<Shift, 'start' | 'end'>): boolean {
  return parseTime(shift.end) <= parseTime(shift.start);
}

export interface ShiftSegment {
  date: DateStr;
  /** Minutes since midnight on `date`. */
  startMin: number;
  endMin: number;
  grossMinutes: number;
  /** Break minutes allocated to this segment (see allocateBreak). */
  breakMinutes: number;
  workedMinutes: number;
}

/**
 * Split a shift into one segment per calendar day it touches.
 *
 * A night shift 22:00–06:00 on the 20th becomes 22:00–24:00 on the 20th and 00:00–06:00
 * on the 21st. This is what makes per-day, per-week and per-pay-period sums correct for
 * shifts that cross midnight or a pay-period boundary.
 *
 * The break is split proportionally to segment length; leftover whole minutes go to the
 * longest segment first, so the allocated break always sums exactly to breakMinutes.
 */
export function shiftSegments(shift: Shift): ShiftSegment[] {
  const total = shiftGrossMinutes(shift);
  const startMin = parseTime(shift.start);
  const raw: { date: DateStr; startMin: number; endMin: number; grossMinutes: number }[] = [];

  let remaining = total;
  let dayOffset = 0;
  while (remaining > 0) {
    const from = dayOffset === 0 ? startMin : 0;
    const take = Math.min(MINUTES_PER_DAY - from, remaining);
    raw.push({
      date: addDays(shift.date, dayOffset),
      startMin: from,
      endMin: from + take,
      grossMinutes: take,
    });
    remaining -= take;
    dayOffset += 1;
  }

  const breaks = allocateBreak(
    Math.min(shift.breakMinutes, total),
    raw.map((segment) => segment.grossMinutes),
  );

  return raw.map((segment, index) => {
    const breakMinutes = breaks[index] ?? 0;
    return {
      ...segment,
      breakMinutes,
      workedMinutes: Math.max(0, segment.grossMinutes - breakMinutes),
    };
  });
}

/** Proportional split of a break over segments, summing exactly to `breakMinutes`. */
export function allocateBreak(breakMinutes: number, segmentMinutes: readonly number[]): number[] {
  const total = segmentMinutes.reduce((a, b) => a + b, 0);
  if (total <= 0 || breakMinutes <= 0) return segmentMinutes.map(() => 0);

  const exact = segmentMinutes.map((minutes) => (breakMinutes * minutes) / total);
  const allocated = exact.map((value) => Math.floor(value));
  let leftover = breakMinutes - allocated.reduce((a, b) => a + b, 0);

  const order = segmentMinutes
    .map((minutes, index) => ({ minutes, index }))
    .sort((a, b) => b.minutes - a.minutes || a.index - b.index);

  let cursor = 0;
  while (leftover > 0 && order.length > 0) {
    const target = order[cursor % order.length];
    if (target) allocated[target.index] = (allocated[target.index] ?? 0) + 1;
    leftover -= 1;
    cursor += 1;
  }
  return allocated;
}

/**
 * Overlap in minutes between a segment on one day and a clock window.
 * The window may wrap past midnight (e.g. a night supplement 21:00–06:00).
 */
export function windowOverlapMinutes(
  segment: { startMin: number; endMin: number },
  windowFromMin: number,
  windowToMin: number,
): number {
  const plain = (from: number, to: number) =>
    Math.max(0, Math.min(segment.endMin, to) - Math.max(segment.startMin, from));

  if (windowToMin > windowFromMin) return plain(windowFromMin, windowToMin);
  if (windowToMin === windowFromMin) return 0;
  // Wrapping window: [from, 24:00) plus [00:00, to)
  return plain(windowFromMin, MINUTES_PER_DAY) + plain(0, windowToMin);
}

export interface Doegn {
  /** Absolute minute instant the 24-hour window starts (= start of its first shift). */
  startInstant: number;
  date: DateStr;
  shifts: Shift[];
  workedMinutes: number;
  /** Absolute minute instant work in this døgn last stopped. */
  endInstant: number;
}

export const DEFAULT_NEW_DOEGN_AFTER_REST_HOURS = 11;

/**
 * Group shifts into arbeidsdøgn: work periods measured over 24 hours from when work begins.
 *
 * Two things close a døgn and open the next one:
 *  - the worker has had their daily rest (by default 11 hours, the AML § 10-8 minimum), or
 *  - 24 hours have passed since the døgn began.
 *
 * The rest condition is what matters in practice. Without it, a Friday evening shift and a
 * Saturday day shift 12 hours later would land in the same 24-hour window and be reported
 * as overtime, even though the worker had a full daily rest between them. With it, a
 * 22:00–06:00 night shift stays one work period, and a "clopening" — closing at 23:00 and
 * opening at 07:00 — is correctly seen as one long stretch of work inside 24 hours.
 */
export function doegnGroups(
  shifts: readonly Shift[],
  options: { newPeriodAfterRestHours?: number } = {},
): Doegn[] {
  const restThresholdMinutes =
    (options.newPeriodAfterRestHours ?? DEFAULT_NEW_DOEGN_AFTER_REST_HOURS) * 60;
  const sorted = [...shifts].sort((a, b) => shiftStartInstant(a) - shiftStartInstant(b));
  const groups: Doegn[] = [];

  for (const shift of sorted) {
    const start = shiftStartInstant(shift);
    const end = shiftEndInstant(shift);
    const current = groups[groups.length - 1];

    const insideWindow = current !== undefined && start < current.startInstant + MINUTES_PER_DAY;
    const beforeRest = current !== undefined && start - current.endInstant < restThresholdMinutes;

    if (current && insideWindow && beforeRest) {
      current.shifts.push(shift);
      current.workedMinutes += shiftWorkedMinutes(shift);
      current.endInstant = Math.max(current.endInstant, end);
    } else {
      groups.push({
        startInstant: start,
        date: shift.date,
        shifts: [shift],
        workedMinutes: shiftWorkedMinutes(shift),
        endInstant: end,
      });
    }
  }
  return groups;
}

/** Rest in hours between the end of one shift and the start of the next. */
export function restHoursBetween(previous: Shift, next: Shift): number {
  return (shiftStartInstant(next) - shiftEndInstant(previous)) / 60;
}
