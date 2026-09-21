import { describe, expect, it } from 'vitest';
import { contractedHoursPerWeek, effectiveHourlyRateOre, normalDailyLimitHours, normalWeeklyLimitHours } from '@/domain/derive';
import { NO_AGREED_TERMS, type Contract } from '@/domain/schemas';

const base: Contract = {
  id: 'c1',
  employer: 'Kafé Nordlys AS',
  employeeName: 'Kari Testesen',
  startDate: '2025-06-01',
  endDate: null,
  stillingsprosent: 50,
  fullTimeHoursPerWeek: 37.5,
  contractedHoursPerWeek: null,
  wage: { kind: 'hourly', amountOre: 19850 },
  tariffavtale: null,
  averagingAgreement: false,
  ...NO_AGREED_TERMS,
  supplements: [],
  documentRef: null,
};

describe('avledet fra kontrakten', () => {
  it('regner avtalt arbeidstid fra stillingsprosent', () => {
    expect(contractedHoursPerWeek(base)).toBe(18.75);
    expect(contractedHoursPerWeek({ ...base, stillingsprosent: 60 })).toBe(22.5);
    expect(contractedHoursPerWeek({ ...base, stillingsprosent: 100, fullTimeHoursPerWeek: 40 })).toBe(40);
  });

  it('bruker avtalt arbeidstid fra kontrakten når den står der', () => {
    expect(contractedHoursPerWeek({ ...base, contractedHoursPerWeek: 20 })).toBe(20);
  });

  it('bruker timelønn direkte', () => {
    expect(effectiveHourlyRateOre(base)).toBe(19850);
  });

  it('regner timelønn fra månedslønn', () => {
    // 100 % stilling, 37,5 t/uke, 40 000 kr/mnd -> 40 000 × 12 / 1950 = 246,15 kr
    const monthly: Contract = {
      ...base,
      stillingsprosent: 100,
      wage: { kind: 'monthly', amountOre: 4_000_000 },
    };
    expect(effectiveHourlyRateOre(monthly)).toBe(24615);
  });

  it('bruker lovens grenser med mindre kontrakten avtaler noe annet', () => {
    expect(normalDailyLimitHours(base, {})).toBe(9);
    expect(normalWeeklyLimitHours(base, {})).toBe(40);
    expect(normalDailyLimitHours({ ...base, normalDailyLimitHours: 10 }, {})).toBe(10);
    expect(normalWeeklyLimitHours(base, { normal_weekly_limit_hours: 38 })).toBe(38);
  });
});
