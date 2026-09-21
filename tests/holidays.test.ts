import { describe, expect, it } from 'vitest';
import { easterSunday, holidayName, isHoliday, norwegianHolidays } from '@/domain/holidays';

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
