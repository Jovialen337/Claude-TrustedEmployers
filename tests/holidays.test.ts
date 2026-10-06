import { describe, expect, it } from 'vitest';
import { easterSunday, holidayName, isHoliday, norwegianHolidays, isVirkedag, sundayWorkWindows, sundayWorkMinutes } from '@/domain/holidays';

describe('norske helligdager', () => {
  it('regner ut påskedag', () => {
    expect(easterSunday(2024)).toBe('2024-03-31');
    expect(easterSunday(2025)).toBe('2025-04-20');
    expect(easterSunday(2026)).toBe('2026-04-05');
  });

  it('gir alle tolv helligdagene', () => {
    const holidays = norwegianHolidays(2026);
    expect(holidays.size).toBe(12);
    expect(holidays.get('2026-01-01')).toBe('Første nyttårsdag');
    expect(holidays.get('2026-04-02')).toBe('Skjærtorsdag');
    expect(holidays.get('2026-04-03')).toBe('Langfredag');
    expect(holidays.get('2026-04-06')).toBe('Andre påskedag');
    expect(holidays.get('2026-05-01')).toBe('Arbeidernes dag');
    expect(holidays.get('2026-05-14')).toBe('Kristi himmelfartsdag');
    expect(holidays.get('2026-05-17')).toBe('Grunnlovsdagen');
    expect(holidays.get('2026-05-25')).toBe('Andre pinsedag');
    expect(holidays.get('2026-12-25')).toBe('Første juledag');
    expect(holidays.get('2026-12-26')).toBe('Andre juledag');
  });

  it('kjenner igjen en helligdag, men ikke en vanlig dag', () => {
    expect(isHoliday('2026-05-17')).toBe(true);
    expect(holidayName('2026-05-17')).toBe('Grunnlovsdagen');
    expect(isHoliday('2026-08-20')).toBe(false);
    expect(isHoliday('2026-12-24')).toBe(false); // julaften er ikke helligdag
    expect(isHoliday('2026-08-23')).toBe(false); // søndag regnes som helg, ikke helligdag
  });
});

/**
 * Søn- og helgedagsarbeid as AML § 10-10 første ledd actually defines it.
 *
 * Verbatim, from docs/lovtekst/arbeidsmiljoloven.txt:
 *   "Det skal være arbeidsfri fra kl. 1800 dagen før en søn- eller helgedag og til kl. 2200
 *    dagen før neste virkedag. Jul-, påske- og pinseaften skal det være arbeidsfri fra kl.
 *    1500 til kl. 2200 dagen før neste virkedag. Arbeid innenfor disse tidsrom regnes som
 *    søn- og helgedagsarbeid."
 *
 * The rule used to read this as "work whose calendar date is a Sunday", which misses every
 * Saturday evening — the commonest shift there is in a shop or a café.
 */
describe('søn- og helgedagsarbeid etter § 10-10 første ledd', () => {
  // 2026-08-15 is a Saturday, 2026-08-16 the Sunday after it.
  const week = sundayWorkWindows('2026-08-10', '2026-08-16');

  it('åpner kl. 18 lørdag og lukker kl. 22 søndag', () => {
    expect(week).toHaveLength(1);
    expect(week[0]).toMatchObject({
      fromDate: '2026-08-15',
      fromMinute: 18 * 60,
      toDate: '2026-08-16',
      toMinute: 22 * 60,
    });
  });

  it('regner lørdagskvelden fra kl. 18 som søndagsarbeid', () => {
    // 17:00–23:00 on the Saturday: five of the six hours fall after 18:00.
    expect(sundayWorkMinutes('2026-08-15', 17 * 60, 23 * 60, week)).toBe(5 * 60);
  });

  it('regner ikke lørdag ettermiddag før kl. 18', () => {
    expect(sundayWorkMinutes('2026-08-15', 10 * 60, 18 * 60, week)).toBe(0);
  });

  it('stopper kl. 22 på søndagen, ikke ved midnatt', () => {
    // A Sunday shift 17:00–23:30 is protected until 22:00 only.
    expect(sundayWorkMinutes('2026-08-16', 17 * 60, 23 * 60 + 30, week)).toBe(5 * 60);
  });

  it('dekker hele søndagen for en vakt som starter om morgenen', () => {
    expect(sundayWorkMinutes('2026-08-16', 8 * 60, 16 * 60, week)).toBe(8 * 60);
  });

  it('deler påsken i to vern, fordi påskeaften er en virkedag', () => {
    // Easter 2026: skjærtorsdag Thu 2 April, langfredag Fri 3, påskeaften Sat 4,
    // første påskedag Sun 5, andre påskedag Mon 6. Påskeaften is a Saturday and is not a
    // statutory holiday, so it IS a virkedag — which is where the first window has to close.
    const easter = sundayWorkWindows('2026-03-30', '2026-04-07');
    expect(easter).toHaveLength(2);

    // 18:00 Wednesday (the eve of skjærtorsdag) → 22:00 langfredag.
    expect(easter[0]).toMatchObject({
      fromDate: '2026-04-01',
      fromMinute: 18 * 60,
      toDate: '2026-04-03',
      toMinute: 22 * 60,
    });
    expect(easter[0]!.days).toEqual(['2026-04-02', '2026-04-03']);

    // Then 15:00 påskeaften → 22:00 andre påskedag, the day before the next virkedag.
    expect(easter[1]).toMatchObject({
      fromDate: '2026-04-04',
      fromMinute: 15 * 60,
      toDate: '2026-04-06',
      toMinute: 22 * 60,
    });
    expect(easter[1]!.days).toEqual(['2026-04-05', '2026-04-06']);

    // Working påskeaften 12:00–20:00 is five hours of helgedagsarbeid, not none.
    expect(sundayWorkMinutes('2026-04-04', 12 * 60, 20 * 60, easter)).toBe(5 * 60);
  });

  it('åpner kl. 15 på julaften', () => {
    const jul = sundayWorkWindows('2026-12-20', '2026-12-28');
    const run = jul.find((w) => w.fromDate === '2026-12-24');
    expect(run).toBeDefined();
    expect(run!.fromMinute).toBe(15 * 60);
    // 25 Dec is a Friday, 26 Dec a Saturday and 27 Dec a Sunday: one unbroken run.
    expect(run!.days).toEqual(['2026-12-25', '2026-12-26', '2026-12-27']);
    expect(run!.toDate).toBe('2026-12-27');
    // 13:00–20:00 on julaften: five hours after 15:00.
    expect(sundayWorkMinutes('2026-12-24', 13 * 60, 20 * 60, jul)).toBe(5 * 60);
  });

  it('kaller lørdag en virkedag, men ikke søndag og ikke 17. mai', () => {
    expect(isVirkedag('2026-08-15')).toBe(true);
    expect(isVirkedag('2026-08-16')).toBe(false);
    expect(isVirkedag('2026-05-17')).toBe(false);
  });

  it('gir ingen vinduer for en uke uten søndag eller helligdag', () => {
    // Monday to Friday only.
    expect(sundayWorkWindows('2026-08-10', '2026-08-14').filter((w) => w.days.some((d) => d >= '2026-08-10' && d <= '2026-08-14'))).toHaveLength(0);
  });
});
