import { describe, expect, it } from 'vitest';
import {
  effectiveShifts,
  hoursInRange,
  holidayHours,
  monthBuckets,
  payslipCovering,
  payslipLabel,
  payslipSummary,
  payslipsOverlapping,
  segmentsOf,
  supplementHours,
  weekBuckets,
} from '@/domain/aggregate';
import { line, ordinaryLine, payslip, shift, supplement } from './fixtures';

describe('hvilke vakter som gjelder', () => {
  it('lar registrerte timer overstyre planen for samme dag', () => {
    const shifts = [
      shift('2026-08-17', '10:00', '16:00'),
      shift('2026-08-17', '10:00', '18:00', { kind: 'jobbet' }),
      shift('2026-08-18', '10:00', '14:00'),
    ];
    const effective = effectiveShifts(shifts);
    expect(effective).toHaveLength(2);
    expect(effective.find((s) => s.date === '2026-08-17')!.end).toBe('18:00');
    expect(effective.find((s) => s.date === '2026-08-18')!.kind).toBe('planlagt');
  });
});

describe('timer per uke og måned', () => {
  it('summerer uker med ISO-uketall', () => {
    const buckets = weekBuckets([
      shift('2026-08-17', '10:00', '16:00'), // uke 34, 6 t
      shift('2026-08-20', '10:00', '16:30'), // uke 34, 6,5 t
      shift('2026-08-24', '10:00', '14:00'), // uke 35, 4 t
    ]);
    expect(buckets.map((b) => b.key)).toEqual(['2026-W34', '2026-W35']);
    expect(buckets[0]!.plannedHours).toBe(12.5);
    expect(buckets[0]!.label).toBe('Uke 34 2026');
    expect(buckets[0]!.start).toBe('2026-08-17');
    expect(buckets[0]!.end).toBe('2026-08-23');
    expect(buckets[1]!.plannedHours).toBe(4);
  });

  it('deler en nattevakt mellom to måneder', () => {
    // 31. august 22:00 – 1. september 06:00: 2 timer i august, 6 i september.
    const buckets = monthBuckets([shift('2026-08-31', '22:00', '06:00')]);
    expect(buckets.map((b) => b.key)).toEqual(['2026-08', '2026-09']);
    expect(buckets[0]!.plannedHours).toBe(2);
    expect(buckets[1]!.plannedHours).toBe(6);
  });

  it('summerer timer i et fritt datointervall', () => {
    const segments = segmentsOf([
      shift('2026-08-17', '08:00', '16:00', { breakMinutes: 30 }),
      shift('2026-08-24', '08:00', '12:00'),
    ]);
    expect(hoursInRange(segments, '2026-08-17', '2026-08-23')).toBe(7.5);
    expect(hoursInRange(segments, '2026-08-17', '2026-08-31')).toBe(11.5);
    expect(hoursInRange(segments, '2026-09-01', '2026-09-30')).toBe(0);
  });
});

describe('oppsummering av lønnsslipp', () => {
  it('teller bare arbeidstimer som timer, ikke tilleggslinjer', () => {
    const summary = payslipSummary(
      payslip('2026-08-01', '2026-08-31', [
        ordinaryLine(70),
        line('overtid_40', 2, 27790, 55580, 'Overtid 40 %'),
        line('kveldstillegg', 12, 2500, 30000, 'Kveldstillegg'),
        line('annet', null, null, 15000, 'Utlegg'),
      ]),
    );
    // 70 ordinære + 2 overtid = 72 t. Kveldstillegget er penger på timer som alt er tellet.
    expect(summary.paidWorkHours).toBe(72);
    expect(summary.paidOvertimeHours).toBe(2);
    expect(summary.byCategory.get('kveldstillegg')!.amountOre).toBe(30000);
    expect(summary.linesTotalOre).toBe(70 * 19850 + 55580 + 30000 + 15000);
    expect(summary.label).toBe('Lønn for august 2026');
  });

  it('bruker oppgitt bruttolønn når den finnes', () => {
    const summary = payslipSummary(
      payslip('2026-08-01', '2026-08-31', [ordinaryLine(10)], { grossOre: 200000 }),
    );
    expect(summary.grossOre).toBe(200000);
    expect(summary.linesTotalOre).toBe(198500);
  });

  it('merker en lønnsperiode som ikke er en hel måned', () => {
    expect(payslipLabel(payslip('2026-08-01', '2026-08-15', []))).toBe('Lønn for 2026-08-01 – 2026-08-15');
  });

  it('finner lønnsslipper som overlapper et intervall', () => {
    const slips = [payslip('2026-08-01', '2026-08-31', []), payslip('2026-09-01', '2026-09-30', [])];
    expect(payslipsOverlapping(slips, '2026-08-31', '2026-09-06').map((p) => p.periodStart)).toEqual([
      '2026-08-01',
      '2026-09-01',
    ]);
    expect(payslipCovering(slips, '2026-08-01', '2026-08-31')!.id).toBe(slips[0]!.id);
    expect(payslipCovering(slips, '2026-08-17', '2026-08-23')).toBeNull();
  });
});

describe('timer i tilleggsvindu', () => {
  it('regner kveldstimer etter kl. 18', () => {
    const segments = segmentsOf([shift('2026-08-17', '14:00', '22:00')]);
    expect(supplementHours(segments, supplement(), '2026-08-01', '2026-08-31')).toBe(4);
  });

  it('regner nattillegg over midnatt på begge dager', () => {
    const segments = segmentsOf([shift('2026-08-20', '22:00', '06:00')]);
    const natt = supplement({ kind: 'natt', label: 'Nattillegg', fromTime: '21:00', toTime: '06:00' });
    expect(supplementHours(segments, natt, '2026-08-01', '2026-08-31')).toBe(8);
    // Bare den delen som ligger 21. august teller når vi avgrenser til den dagen.
    expect(supplementHours(segments, natt, '2026-08-21', '2026-08-21')).toBe(6);
  });

  it('trekker fra pausen forholdsmessig', () => {
    // 6 timers vakt med 30 min pause, hele vakta i vinduet -> 5,5 t med tillegg.
    const segments = segmentsOf([shift('2026-08-17', '18:00', '00:00', { breakMinutes: 30 })]);
    expect(supplementHours(segments, supplement(), '2026-08-01', '2026-08-31')).toBe(5.5);
  });

  it('gir helgetillegg bare i helga', () => {
    const segments = segmentsOf([
      shift('2026-08-21', '10:00', '16:00'), // fredag
      shift('2026-08-22', '10:00', '16:00'), // lørdag
      shift('2026-08-23', '10:00', '14:00'), // søndag
    ]);
    const helg = supplement({ kind: 'helg', label: 'Helgetillegg', fromTime: null, toTime: null });
    expect(supplementHours(segments, helg, '2026-08-17', '2026-08-23')).toBe(10);
  });

  it('gir helligdagstillegg bare på helligdager', () => {
    const segments = segmentsOf([
      shift('2026-05-17', '10:00', '16:00'), // Grunnlovsdagen
      shift('2026-05-18', '10:00', '16:00'), // vanlig mandag
    ]);
    const helligdag = supplement({ kind: 'helligdag', label: 'Helligdagstillegg', fromTime: null, toTime: null });
    expect(supplementHours(segments, helligdag, '2026-05-01', '2026-05-31')).toBe(6);
    expect(holidayHours(segments, '2026-05-01', '2026-05-31')).toBe(6);
  });
});
