/**
 * The demo worker's shifts: a regular weekly pattern with a few deliberate exceptions.
 *
 * Fake data only — fake name, fake employer, no personnummer and no account numbers.
 * Twelve whole ISO weeks, Monday 4 May 2026 to Sunday 26 July 2026, so the check has
 * complete weeks to judge and three full calendar months of payslips to compare against.
 */
import type { Shift } from '../domain/schemas';
import { addDays, isoWeek, isoWeekKey } from '../domain/time';

export const DEMO_FIRST_MONDAY = '2026-05-04';
export const DEMO_WEEKS = 12;
export const VAKTPLAN_DOC_ID = 'demo-vaktplan';

interface PatternShift {
  /** 1 = Monday … 7 = Sunday */
  weekday: number;
  start: string;
  end: string;
  breakMinutes: number;
}

/** A normal week: four evening shifts and a Saturday day shift = 27,5 t. */
const REGULAR_WEEK: PatternShift[] = [
  { weekday: 1, start: '17:00', end: '22:00', breakMinutes: 0 },
  { weekday: 2, start: '17:00', end: '22:00', breakMinutes: 0 },
  { weekday: 4, start: '17:00', end: '22:00', breakMinutes: 0 },
  { weekday: 5, start: '17:00', end: '22:00', breakMinutes: 0 },
  { weekday: 6, start: '10:00', end: '18:00', breakMinutes: 30 },
];

/**
 * Deliberate exceptions, each planted to trigger exactly one kind of flag:
 *  - 2026-W25: Friday runs to 23:00 and Saturday starts 07:00 -> only 8 h rest (AML § 10-8)
 *  - 2026-W28: Friday and Saturday cancelled -> a week well under the stillingsprosent
 *  - 2026-W29: an 11-hour Wednesday with no registered break -> overtime (§ 10-6) and a
 *    missing break (§ 10-9)
 */
const WEEK_EXCEPTIONS: Record<string, PatternShift[]> = {
  '2026-W25': [
    { weekday: 1, start: '17:00', end: '22:00', breakMinutes: 0 },
    { weekday: 2, start: '17:00', end: '22:00', breakMinutes: 0 },
    { weekday: 4, start: '17:00', end: '22:00', breakMinutes: 0 },
    { weekday: 5, start: '15:00', end: '23:00', breakMinutes: 0 },
    { weekday: 6, start: '07:00', end: '13:00', breakMinutes: 30 },
  ],
  '2026-W28': [
    { weekday: 1, start: '17:00', end: '22:00', breakMinutes: 0 },
    { weekday: 2, start: '17:00', end: '22:00', breakMinutes: 0 },
    { weekday: 4, start: '17:00', end: '22:00', breakMinutes: 0 },
  ],
  '2026-W29': [
    { weekday: 1, start: '17:00', end: '22:00', breakMinutes: 0 },
    { weekday: 3, start: '08:00', end: '19:00', breakMinutes: 0 },
    { weekday: 4, start: '17:00', end: '22:00', breakMinutes: 0 },
    { weekday: 5, start: '17:00', end: '22:00', breakMinutes: 0 },
    { weekday: 6, start: '10:00', end: '18:00', breakMinutes: 30 },
  ],
};

/** The one day where the plan and the hours actually worked differ: an hour of overtime stay. */
const WORKED_LATER = { date: '2026-07-20', start: '17:00', end: '23:00' };

function documentRef(page: number) {
  return {
    docId: VAKTPLAN_DOC_ID,
    docName: 'Vaktplan mai–juli 2026 (eksport fra vaktsystem).csv',
    page,
    kind: 'vaktplan' as const,
  };
}

export function demoShifts(): Shift[] {
  const shifts: Shift[] = [];

  for (let week = 0; week < DEMO_WEEKS; week += 1) {
    const monday = addDays(DEMO_FIRST_MONDAY, week * 7);
    const key = isoWeekKey(isoWeek(monday));
    const pattern = WEEK_EXCEPTIONS[key] ?? REGULAR_WEEK;

    for (const entry of pattern) {
      const date = addDays(monday, entry.weekday - 1);
      const isTheLateDay = date === WORKED_LATER.date && entry.start === WORKED_LATER.start;

      shifts.push({
        id: `demo-vakt-${date}-${entry.start.replace(':', '')}`,
        date,
        start: entry.start,
        end: entry.end,
        breakMinutes: entry.breakMinutes,
        // Everything comes from the shift-system export as hours worked, except the one
        // day below where the plan said 22:00 and the worker stayed until 23:00.
        kind: isTheLateDay ? 'planlagt' : 'jobbet',
        source: 'import',
        note: null,
        documentRef: documentRef(1 + Math.floor(week / 4)),
      });

      if (isTheLateDay) {
        shifts.push({
          id: `demo-vakt-${date}-jobbet`,
          date,
          start: WORKED_LATER.start,
          end: WORKED_LATER.end,
          breakMinutes: 0,
          kind: 'jobbet',
          source: 'manuell',
          note: 'Ble en time lenger enn planlagt (stengte alene).',
          documentRef: null,
        });
      }
    }
  }

  return shifts.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}
