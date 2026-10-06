/**
 * Norwegian public holidays (helligdager / høytidsdager), computed rather than tabulated
 * so the app keeps working in any year.
 *
 * Note: the *calendar* is used only to identify which hours fall on a holiday. Whether a
 * holiday supplement is owed, and how big it is, comes from the user's contract or tariff
 * agreement — never from this file. See rules/no_default.json (`supplements`).
 *
 * Sundays are not listed here even though they are "helligdag" in lov om helligdager;
 * Sunday work is handled by the weekend supplement instead. See DECISIONS.md.
 */
import type { DateStr } from './schemas';
import { addDays, weekdayIso } from './time';

/** Easter Sunday, anonymous Gregorian algorithm. */
export function easterSunday(year: number): DateStr {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** All Norwegian public holidays in a year, keyed by date. */
export function norwegianHolidays(year: number): Map<DateStr, string> {
  const easter = easterSunday(year);
  const holidays: [DateStr, string][] = [
    [`${year}-01-01`, 'Første nyttårsdag'],
    [addDays(easter, -3), 'Skjærtorsdag'],
    [addDays(easter, -2), 'Langfredag'],
    [easter, 'Første påskedag'],
    [addDays(easter, 1), 'Andre påskedag'],
    [`${year}-05-01`, 'Arbeidernes dag'],
    [`${year}-05-17`, 'Grunnlovsdagen'],
    [addDays(easter, 39), 'Kristi himmelfartsdag'],
    [addDays(easter, 49), 'Første pinsedag'],
    [addDays(easter, 50), 'Andre pinsedag'],
    [`${year}-12-25`, 'Første juledag'],
    [`${year}-12-26`, 'Andre juledag'],
  ];
  return new Map(holidays);
}

const cache = new Map<number, Map<DateStr, string>>();

function holidaysFor(year: number): Map<DateStr, string> {
  let found = cache.get(year);
  if (!found) {
    found = norwegianHolidays(year);
    cache.set(year, found);
  }
  return found;
}

export function holidayName(date: DateStr): string | null {
  return holidaysFor(Number(date.slice(0, 4))).get(date) ?? null;
}

export function isHoliday(date: DateStr): boolean {
  return holidayName(date) !== null;
}

/**
 * A virkedag, as ferieloven § 5 nr. 1 defines it: every day that is neither a Sunday nor a
 * statutory holiday. Saturday is a virkedag.
 */
export function isVirkedag(date: DateStr): boolean {
  return weekdayIso(date) !== 7 && !isHoliday(date);
}

/**
 * The three eves where the protected period starts at 15:00 rather than 18:00:
 * julaften, påskeaften and pinseaften (AML § 10-10 første ledd andre punktum).
 */
export function isSpecialEve(date: DateStr): boolean {
  const year = Number(date.slice(0, 4));
  const easter = easterSunday(year);
  return (
    date === `${year}-12-24` || date === addDays(easter, -1) || date === addDays(easter, 48)
  );
}

/** One stretch of time the law counts as søn- og helgedagsarbeid. */
export interface SundayWindow {
  /** The day the window opens, and the minute of that day it opens at. */
  fromDate: DateStr;
  fromMinute: number;
  /** The day the window closes, and the minute of that day it closes at. */
  toDate: DateStr;
  toMinute: number;
  /** The Sundays and holidays the window protects, for naming the finding. */
  days: DateStr[];
}

/**
 * The windows AML § 10-10 første ledd calls søn- og helgedagsarbeid.
 *
 * The statute does not say "work on a Sunday". It says there shall be no work *from 18:00 the
 * day before a Sunday or holiday until 22:00 the day before the next working day* — and 15:00
 * instead of 18:00 before julaften, påskeaften and pinseaften — and that work inside those
 * periods counts as søn- og helgedagsarbeid.
 *
 * Two things follow that a calendar-day reading gets wrong. A Saturday evening shift from
 * 18:00 is Sunday work, which matters to nearly everyone working in a shop or a café. And a
 * run of Sunday plus holidays is one window to 22:00 on its last day, so the Easter weekend is
 * protected throughout rather than only on its Sundays.
 */
export function sundayWorkWindows(from: DateStr, to: DateStr): SundayWindow[] {
  const windows: SundayWindow[] = [];
  // Reach a day past each end, so a window straddling the range is still produced whole.
  let day = addDays(from, -1);
  const last = addDays(to, 1);

  while (day <= last) {
    if (isVirkedag(day)) {
      day = addDays(day, 1);
      continue;
    }
    // A run of consecutive non-virkedager is one window.
    const run: DateStr[] = [];
    let cursor = day;
    while (cursor <= addDays(last, 2) && !isVirkedag(cursor)) {
      run.push(cursor);
      cursor = addDays(cursor, 1);
    }
    const eve = addDays(run[0]!, -1);
    windows.push({
      fromDate: eve,
      fromMinute: isSpecialEve(eve) ? 15 * 60 : 18 * 60,
      toDate: run[run.length - 1]!,
      toMinute: 22 * 60,
      days: run,
    });
    day = cursor;
  }

  // Scanning starts a day early so a window straddling the start is produced whole; drop the
  // ones that turn out to lie entirely outside what was asked for.
  return windows.filter((window) => window.toDate >= from && window.fromDate <= to);
}

/** Minutes of one day's stretch of work that fall inside søn- og helgedagsarbeid. */
export function sundayWorkMinutes(
  date: DateStr,
  startMinute: number,
  endMinute: number,
  windows: readonly SundayWindow[],
): number {
  let total = 0;
  for (const window of windows) {
    // Express the window on this date's timeline; a day outside it contributes nothing.
    const opens =
      date < window.fromDate ? Number.POSITIVE_INFINITY : date === window.fromDate ? window.fromMinute : 0;
    const closes =
      date > window.toDate ? Number.NEGATIVE_INFINITY : date === window.toDate ? window.toMinute : 24 * 60;
    total += Math.max(0, Math.min(endMinute, closes) - Math.max(startMinute, opens));
  }
  return total;
}
