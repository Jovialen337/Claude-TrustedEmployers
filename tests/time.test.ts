import { describe, expect, it } from 'vitest';
import {
  addDays,
  allocateBreak,
  crossesMidnight,
  daysBetween,
  doegnGroups,
  isoWeek,
  isoWeekEnd,
  isoWeekKey,
  isoWeekStart,
  monthEnd,
  monthKey,
  monthLabel,
  parseTime,
  restHoursBetween,
  shiftGrossMinutes,
  shiftSegments,
  shiftWorkedHours,
  weekdayIso,
  windowOverlapMinutes,
} from '@/domain/time';
import type { Shift } from '@/domain/schemas';

function shift(partial: Partial<Shift> & Pick<Shift, 'date' | 'start' | 'end'>): Shift {
  return {
    id: partial.id ?? `${partial.date}-${partial.start}`,
    date: partial.date,
    start: partial.start,
    end: partial.end,
    breakMinutes: partial.breakMinutes ?? 0,
    kind: partial.kind ?? 'planlagt',
    source: partial.source ?? 'manuell',
    note: partial.note ?? null,
    documentRef: partial.documentRef ?? null,
  };
}

describe('klokke og dato', () => {
  it('leser klokkeslett', () => {
    expect(parseTime('00:00')).toBe(0);
    expect(parseTime('08:30')).toBe(510);
    expect(parseTime('23:59')).toBe(1439);
  });

  it('regner dager', () => {
    expect(addDays('2026-08-20', 1)).toBe('2026-08-21');
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // leap year
    expect(daysBetween('2026-08-01', '2026-09-01')).toBe(31);
  });

  it('finner ISO-ukedag og uke', () => {
    expect(weekdayIso('2026-08-17')).toBe(1); // mandag
    expect(weekdayIso('2026-08-23')).toBe(7); // søndag
    expect(isoWeekKey(isoWeek('2026-08-17'))).toBe('2026-W34');
    expect(isoWeekKey(isoWeek('2026-08-23'))).toBe('2026-W34');
    expect(isoWeekStart({ year: 2026, week: 34 })).toBe('2026-08-17');
    expect(isoWeekEnd({ year: 2026, week: 34 })).toBe('2026-08-23');
  });

  it('håndterer årsskifte i ISO-uker', () => {
    // 1. januar 2026 er en torsdag, så uke 1 starter 29. desember 2025.
    expect(isoWeekKey(isoWeek('2026-01-01'))).toBe('2026-W01');
    expect(isoWeekStart({ year: 2026, week: 1 })).toBe('2025-12-29');
    expect(isoWeekKey(isoWeek('2027-01-01'))).toBe('2026-W53');
  });

  it('regner måneder', () => {
    expect(monthKey('2026-08-20')).toBe('2026-08');
    expect(monthEnd('2026-02')).toBe('2026-02-28');
    expect(monthEnd('2026-12')).toBe('2026-12-31');
    expect(monthLabel('2026-08')).toBe('august 2026');
  });
});

describe('vaktlengde', () => {
  it('regner vanlig vakt', () => {
    expect(shiftGrossMinutes({ start: '08:00', end: '16:00' })).toBe(480);
    expect(shiftWorkedHours(shift({ date: '2026-08-17', start: '08:00', end: '16:00', breakMinutes: 30 }))).toBe(7.5);
  });

  it('regner nattevakt over midnatt', () => {
    expect(crossesMidnight({ start: '22:00', end: '06:00' })).toBe(true);
    expect(shiftGrossMinutes({ start: '22:00', end: '06:00' })).toBe(480);
    expect(shiftGrossMinutes({ start: '23:30', end: '00:30' })).toBe(60);
  });
});

describe('oppdeling av vakt per kalenderdag', () => {
  it('deler nattevakt i to segmenter og fordeler pausen', () => {
    const segments = shiftSegments(
      shift({ date: '2026-08-20', start: '22:00', end: '06:00', breakMinutes: 30 }),
    );
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ date: '2026-08-20', startMin: 1320, endMin: 1440, grossMinutes: 120 });
    expect(segments[1]).toMatchObject({ date: '2026-08-21', startMin: 0, endMin: 360, grossMinutes: 360 });
    // Pausen fordeles forholdsmessig og summerer alltid til 30 minutter.
    expect(segments[0]!.breakMinutes + segments[1]!.breakMinutes).toBe(30);
    expect(segments[0]!.workedMinutes + segments[1]!.workedMinutes).toBe(450);
  });

  it('gir ett segment for en vakt innenfor én dag', () => {
    const segments = shiftSegments(shift({ date: '2026-08-17', start: '08:00', end: '16:00', breakMinutes: 30 }));
    expect(segments).toHaveLength(1);
    expect(segments[0]!.workedMinutes).toBe(450);
  });

  it('fordeler pausen eksakt uansett avrunding', () => {
    expect(allocateBreak(30, [120, 360])).toEqual([7, 23]);
    expect(allocateBreak(30, [120, 360]).reduce((a, b) => a + b, 0)).toBe(30);
    expect(allocateBreak(1, [100, 100])).toEqual([1, 0]);
    expect(allocateBreak(0, [100, 100])).toEqual([0, 0]);
  });
});

describe('tidsvindu for tillegg', () => {
  it('regner overlapp med vanlig vindu', () => {
    expect(windowOverlapMinutes({ startMin: 480, endMin: 960 }, 1080, 1440)).toBe(0); // 08–16 mot 18–24
    expect(windowOverlapMinutes({ startMin: 960, endMin: 1320 }, 1080, 1440)).toBe(240); // 16–22 mot 18–24
  });

  it('regner overlapp med vindu som går over midnatt', () => {
    // Nattillegg 21:00–06:00 mot segment 22:00–24:00
    expect(windowOverlapMinutes({ startMin: 1320, endMin: 1440 }, 1260, 360)).toBe(120);
    // og mot segment 00:00–06:00
    expect(windowOverlapMinutes({ startMin: 0, endMin: 360 }, 1260, 360)).toBe(360);
    // og mot en dagvakt
    expect(windowOverlapMinutes({ startMin: 480, endMin: 960 }, 1260, 360)).toBe(0);
  });
});

describe('arbeidsdøgn og hviletid', () => {
  it('starter et nytt arbeidsdøgn når du har hatt den daglige hvilen', () => {
    // Nattevakt 22:00–06:00, så kveldsvakt 18:00 samme dag: 12 timer fri mellom -> nytt døgn.
    const groups = doegnGroups([
      shift({ date: '2026-08-20', start: '22:00', end: '06:00' }),
      shift({ date: '2026-08-21', start: '18:00', end: '22:00' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.workedMinutes).toBe(480);
    expect(groups[1]!.workedMinutes).toBe(240);
  });

  it('holder en stenge- og åpnevakt med 8 timer fri i samme arbeidsdøgn', () => {
    // Stenger 23:00, åpner 07:00: bare 8 timer fri, altså samme arbeidsdøgn -> 13,5 t.
    const groups = doegnGroups([
      shift({ date: '2026-06-19', start: '15:00', end: '23:00' }),
      shift({ date: '2026-06-20', start: '07:00', end: '13:00', breakMinutes: 30 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.workedMinutes / 60).toBe(13.5);
  });

  it('lukker et arbeidsdøgn etter 24 timer uansett', () => {
    const groups = doegnGroups([
      shift({ date: '2026-08-20', start: '08:00', end: '12:00' }),
      shift({ date: '2026-08-20', start: '20:00', end: '23:00' }),
      shift({ date: '2026-08-21', start: '08:00', end: '12:00' }),
    ]);
    // Vakt 1 og 2: 8 timer fri -> samme døgn. Vakt 3 starter 24 timer etter døgnstart -> nytt.
    expect(groups).toHaveLength(2);
    expect(groups[0]!.shifts).toHaveLength(2);
  });

  it('regner hviletid mellom vakter over midnatt', () => {
    const night = shift({ date: '2026-08-20', start: '22:00', end: '06:00' });
    const next = shift({ date: '2026-08-21', start: '15:00', end: '20:00' });
    expect(restHoursBetween(night, next)).toBe(9); // 06:00 -> 15:00
  });
});
