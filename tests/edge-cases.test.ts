/**
 * The tricky cases called out in the brief, gathered in one place so they are easy to find:
 *   1. a night shift that crosses midnight
 *   2. a shift that crosses a pay-period boundary
 *   3. a public holiday
 *   4. merarbeid vs overtime
 *   5. a missing break
 *   6. a week at 90 % of contract
 */
import { describe, expect, it } from 'vitest';
import { segmentsOf } from '@/domain/aggregate';
import { holidayName } from '@/domain/holidays';
import { check, contract, flagsFor, line, ordinaryLine, payslip, shift, supplement } from './fixtures';

describe('1. nattevakt over midnatt', () => {
  it('fordeler timene på to kalenderdager, men holder dem som ett arbeidsdøgn', () => {
    const night = shift('2026-08-20', '22:00', '06:00', { breakMinutes: 30 });
    const segments = segmentsOf([night]);
    expect(segments.map((s) => s.date)).toEqual(['2026-08-20', '2026-08-21']);
    expect(segments.reduce((sum, s) => sum + s.workedMinutes, 0) / 60).toBe(7.5);

    // 7,5 t er under 9 t, så det er ingen overtid — selv om vakta berører to datoer.
    const result = check({
      shifts: [night],
      payslips: [payslip('2026-08-01', '2026-08-31', [ordinaryLine(7.5)])],
    });
    expect(flagsFor(result, 'overtime').filter((f) => f.amountOre !== null)).toHaveLength(0);
    expect(flagsFor(result, 'scheduled_vs_paid').filter((f) => f.id.includes('timer'))).toHaveLength(0);
  });

  it('gir nattillegg for hele nattevakta, på riktig side av midnatt', () => {
    // Nattillegg 21:00–06:00, 40,00 kr/t. 22:00–06:00 med 30 min pause = 7,5 t.
    // 7,5 t × 40,00 kr = 300,00 kr.
    const result = check({
      contract: contract({
        supplements: [
          supplement({
            id: 'natt',
            kind: 'natt',
            label: 'Nattillegg',
            fromTime: '21:00',
            toTime: '06:00',
            rate: { kind: 'per_hour_ore', value: 4000 },
            source: 'Tariffavtale § 5',
          }),
        ],
      }),
      shifts: [shift('2026-08-20', '22:00', '06:00', { breakMinutes: 30 })],
      payslips: [payslip('2026-08-01', '2026-08-31', [ordinaryLine(7.5)])],
    });
    const flag = flagsFor(result, 'supplements')[0]!;
    expect(flag.amountOre).toBe(30000);
    expect(flag.evidence[0]!.value).toContain('7,5 t');
  });
});

describe('2. vakt over lønnsperiodegrensen', () => {
  it('betaler 2 timer i august og 6 i september', () => {
    const result = check({
      shifts: [shift('2026-08-31', '22:00', '06:00')],
      payslips: [
        payslip('2026-08-01', '2026-08-31', [ordinaryLine(2)]),
        payslip('2026-09-01', '2026-09-30', [ordinaryLine(6)]),
      ],
    });
    expect(flagsFor(result, 'scheduled_vs_paid').filter((f) => f.id.includes('timer'))).toHaveLength(0);
  });

  it('flagger 2,0 t × 198,50 kr = 397,00 kr når augustdelen ikke er betalt', () => {
    const result = check({
      shifts: [shift('2026-08-31', '22:00', '06:00')],
      payslips: [
        payslip('2026-08-01', '2026-08-31', []),
        payslip('2026-09-01', '2026-09-30', [ordinaryLine(6)]),
      ],
    });
    const flags = flagsFor(result, 'scheduled_vs_paid').filter((f) => f.id.includes('timer'));
    expect(flags).toHaveLength(1);
    expect(flags[0]!.calculation!.expression).toBe('2,0 t × 198,50 kr = 397,00 kr');
  });
});

describe('3. helligdag', () => {
  it('kjenner igjen helligdagen og krever avtalt helligdagstillegg', () => {
    expect(holidayName('2026-05-17')).toBe('Grunnlovsdagen');
    // 6 t på Grunnlovsdagen, 100 % tillegg av 198,50 kr -> 1 191,00 kr.
    const result = check({
      contract: contract({
        supplements: [
          supplement({
            id: 'helligdag',
            kind: 'helligdag',
            label: 'Helligdagstillegg',
            fromTime: null,
            toTime: null,
            rate: { kind: 'percent', value: 100 },
            source: 'Tariffavtale § 4',
          }),
        ],
      }),
      shifts: [shift('2026-05-17', '10:00', '16:00')],
      payslips: [payslip('2026-05-01', '2026-05-31', [ordinaryLine(6)])],
    });
    expect(flagsFor(result, 'supplements')[0]!.amountOre).toBe(119100);
  });

  it('krever ikke helligdagstillegg for en vanlig dag', () => {
    const result = check({
      contract: contract({
        supplements: [
          supplement({
            id: 'helligdag',
            kind: 'helligdag',
            label: 'Helligdagstillegg',
            fromTime: null,
            toTime: null,
            rate: { kind: 'percent', value: 100 },
            source: 'Tariffavtale § 4',
          }),
        ],
      }),
      shifts: [shift('2026-05-18', '10:00', '16:00')],
      payslips: [payslip('2026-05-01', '2026-05-31', [ordinaryLine(6)])],
    });
    expect(flagsFor(result, 'supplements')).toHaveLength(0);
  });
});

describe('4. merarbeid mot overtid', () => {
  it('kaller 30 t i uka på en 50 %-kontrakt merarbeid, ikke overtid', () => {
    const result = check({
      shifts: [
        shift('2026-08-17', '10:00', '18:00', { breakMinutes: 30 }),
        shift('2026-08-18', '10:00', '18:00', { breakMinutes: 30 }),
        shift('2026-08-19', '10:00', '18:00', { breakMinutes: 30 }),
        shift('2026-08-20', '10:00', '18:00', { breakMinutes: 30 }),
      ],
      payslips: [payslip('2026-08-01', '2026-08-31', [ordinaryLine(30)])],
    });
    const merarbeid = flagsFor(result, 'overtime').find((f) => f.id === 'overtime:merarbeid')!;
    expect(merarbeid.severity).toBe('til_info');
    expect(merarbeid.title).toContain('merarbeid');
    expect(flagsFor(result, 'overtime').filter((f) => f.amountOre !== null)).toHaveLength(0);
  });

  it('kaller 10 t på én dag overtid, og krever bare 40 %-tillegget', () => {
    // 1,0 t over 9 t × 198,50 kr × 40 % = 79,40 kr.
    const result = check({
      shifts: [shift('2026-08-20', '08:00', '18:00')],
      payslips: [payslip('2026-08-01', '2026-08-31', [ordinaryLine(10)])],
    });
    const flag = flagsFor(result, 'overtime').find((f) => f.amountOre !== null)!;
    expect(flag.amountOre).toBe(7940);
    expect(flag.calculation!.expression).toBe('1,0 t × 198,50 kr × 40 % = 79,40 kr');
  });

  it('krever overtidstillegg også når timene mangler helt på slippen', () => {
    // Ingen timer betalt: grunnlønn 10,0 t × 198,50 = 1 985,00 kr (scheduled_vs_paid)
    // pluss tillegg 1,0 t × 198,50 × 40 % = 79,40 kr (overtime). Til sammen 2 064,40 kr.
    const result = check({
      shifts: [shift('2026-08-20', '08:00', '18:00')],
      payslips: [payslip('2026-08-01', '2026-08-31', [line('annet', null, null, 0, 'Ingen timer')])],
    });
    expect(result.totals.estimatedOwedOre).toBe(198500 + 7940);
  });
});

describe('5. manglende pause', () => {
  it('flagger en vakt på 8 timer uten pause', () => {
    const result = check({
      shifts: [shift('2026-08-20', '10:00', '18:00')],
      payslips: [payslip('2026-08-01', '2026-08-31', [ordinaryLine(8)])],
    });
    const flag = flagsFor(result, 'breaks')[0]!;
    expect(flag.title).toContain('Ingen pause registrert');
    expect(flag.evidence.find((e) => e.label === 'Registrert pause')!.value).toBe('0 minutter');
  });
});

describe('6. uke på 90 % av kontrakten', () => {
  it('flagger differansen med kroner og bevis', () => {
    // Avtalt 20 t, satt opp på 18 t = 90 %. 2,0 t × 198,50 kr = 397,00 kr.
    const result = check({
      contract: contract({ contractedHoursPerWeek: 20 }),
      shifts: [
        shift('2026-08-17', '10:00', '16:00'),
        shift('2026-08-19', '10:00', '16:00'),
        shift('2026-08-21', '10:00', '16:00'),
      ],
      payslips: [payslip('2026-08-01', '2026-08-31', [ordinaryLine(18)])],
    });
    const flag = flagsFor(result, 'hours_vs_stillingsprosent').find((f) => f.id.endsWith('2026-W34'))!;
    expect(flag.amountOre).toBe(39700);
    expect(flag.evidence.find((e) => e.label === 'Avtalt arbeidstid')!.value).toBe('20,0 t (Avtalt arbeidstid står direkte i kontrakten.)');
    expect(flag.evidence.find((e) => e.label === 'Timer som gjelder')!.value).toBe('18,0 t');
    expect(flag.evidence.find((e) => e.label === 'Differanse')!.value).toBe('2,0 t');
  });
});
