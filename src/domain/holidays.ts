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
import { addDays } from './time';

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
