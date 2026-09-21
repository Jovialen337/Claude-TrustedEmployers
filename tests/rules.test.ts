/**
 * Rule tests. Every expected kroner amount here is worked out by hand in the comment
 * above it, so a change in behaviour has to be argued for, not just re-recorded.
 */
import { describe, expect, it } from 'vitest';
import { formatKr } from '@/domain/money';
import {
  HOURLY_RATE_ORE,
  check,
  contract,
  flagsFor,
  line,
  ordinaryLine,
  payslip,
  shift,
  supplement,
} from './fixtures';

/** A payslip for all of August, used to make the August weeks "complete". */
const AUGUST = { start: '2026-08-01', end: '2026-08-31' };

describe('timer mot stillingsprosent', () => {
  it('flagger en uke på 90 % av avtalt arbeidstid med kroner', () => {
    // Avtalt 20 t/uke. Uke 34 (17.–23. august) har 18 t = 90 %.
    // Differanse 2,0 t × 198,50 kr = 397,00 kr.
    const result = check({
      contract: contract({ contractedHoursPerWeek: 20 }),
      shifts: [
        shift('2026-08-17', '10:00', '16:00'), // 6 t
        shift('2026-08-19', '10:00', '16:00'), // 6 t
        shift('2026-08-21', '10:00', '16:00'), // 6 t
      ],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(18)])],
    });

    const week34 = flagsFor(result, 'hours_vs_stillingsprosent').find((flag) => flag.id.endsWith('2026-W34'));
    expect(week34).toBeDefined();
    expect(week34!.amountOre).toBe(39700);
    expect(week34!.calculation!.expression).toBe('2,0 t × 198,50 kr = 397,00 kr');
    expect(week34!.severity).toBe('bor_sjekkes');
    expect(week34!.evidence.map((e) => e.label)).toContain('Differanse');
    expect(week34!.periodStart).toBe('2026-08-17');
    expect(week34!.periodEnd).toBe('2026-08-23');
  });

  it('flagger ikke en uke som er innenfor toleransen', () => {
    // Avtalt 20 t, jobbet 19,75 t -> 0,25 t under, under toleransen på 0,5 t.
    const result = check({
      contract: contract({ contractedHoursPerWeek: 20 }),
      shifts: [
        shift('2026-08-17', '10:00', '20:00', { breakMinutes: 30 }), // 9,5 t
        shift('2026-08-19', '10:00', '20:00', { breakMinutes: 45 }), // 9,25 t
        shift('2026-08-21', '10:00', '11:00'), // 1 t
      ],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(19.75)])],
    });
    expect(flagsFor(result, 'hours_vs_stillingsprosent').find((f) => f.id.endsWith('2026-W34'))).toBeUndefined();
  });

  it('flagger ikke halve uker i kantene av dataene', () => {
    // Bare én vakt: ingen hel uke, så ingen ukesflagg i det hele tatt.
    const result = check({ shifts: [shift('2026-08-20', '10:00', '16:00')] });
    expect(flagsFor(result, 'hours_vs_stillingsprosent')).toHaveLength(0);
  });

  it('summerer måneden som til-info uten å kreve pengene på nytt', () => {
    const result = check({
      contract: contract({ contractedHoursPerWeek: 20 }),
      shifts: [shift('2026-08-17', '10:00', '16:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(6)])],
    });
    const monthly = flagsFor(result, 'hours_vs_stillingsprosent').find((flag) => flag.id.endsWith('2026-08'));
    expect(monthly).toBeDefined();
    expect(monthly!.severity).toBe('til_info');
    expect(monthly!.amountOre).toBeNull();
  });
});

describe('overtid og merarbeid', () => {
  it('skiller merarbeid fra overtid for en deltidsansatt', () => {
    // 50 % stilling = 18,75 t/uke. Uke 34: 4 vakter på 7,5 t = 30 t.
    // Ingen vakt over 9 t og under 40 t i uka -> ingen overtid, 11,25 t merarbeid.
    const result = check({
      shifts: [
        shift('2026-08-17', '10:00', '18:00', { breakMinutes: 30 }),
        shift('2026-08-18', '10:00', '18:00', { breakMinutes: 30 }),
        shift('2026-08-19', '10:00', '18:00', { breakMinutes: 30 }),
        shift('2026-08-20', '10:00', '18:00', { breakMinutes: 30 }),
      ],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(30)])],
    });

    const overtimeFlags = flagsFor(result, 'overtime');
    const merarbeid = overtimeFlags.find((flag) => flag.id === 'overtime:merarbeid');
    expect(merarbeid).toBeDefined();
    expect(merarbeid!.severity).toBe('til_info');
    expect(merarbeid!.amountOre).toBeNull();
    expect(merarbeid!.title).toContain('11,25 t merarbeid');
    expect(merarbeid!.message).toContain('ikke krav på');
    // Ingen overtidskrav, siden ingenting er over lovens grenser.
    expect(overtimeFlags.filter((flag) => flag.amountOre !== null)).toHaveLength(0);
  });

  it('krever 40 % tillegg for timer over 9 t i døgnet, og bare tillegget', () => {
    // Vakt 08:00–19:00 uten pause = 11 t. 2 t over grensen på 9 t.
    // Tillegg: 2,0 t × 198,50 kr × 40 % = 158,80 kr.
    const result = check({
      shifts: [shift('2026-08-20', '08:00', '19:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(11)])],
    });

    const flag = flagsFor(result, 'overtime').find((f) => f.amountOre !== null);
    expect(flag).toBeDefined();
    expect(flag!.amountOre).toBe(15880);
    expect(flag!.calculation!.expression).toBe('2,0 t × 198,50 kr × 40 % = 158,80 kr');
    expect(flag!.severity).toBe('sannsynlig_feil');
    // Grunnlønna kreves ikke her: timene er betalt som ordinære timer.
    expect(flagsFor(result, 'scheduled_vs_paid').filter((f) => f.amountOre !== null)).toHaveLength(0);
  });

  it('godtar overtid som alt er betalt', () => {
    const result = check({
      shifts: [shift('2026-08-20', '08:00', '19:00')],
      payslips: [
        payslip(AUGUST.start, AUGUST.end, [
          ordinaryLine(9),
          line('overtid_40', 2, 27790, 55580, 'Overtid 40 %'),
        ]),
      ],
    });
    expect(flagsFor(result, 'overtime').filter((f) => f.amountOre !== null)).toHaveLength(0);
  });

  it('regner en nattevakt som ett arbeidsdøgn, ikke to halve dager', () => {
    // 22:00–09:00 = 11 t i ett arbeidsdøgn -> 2 t overtid, selv om vakta deles av midnatt.
    const result = check({
      shifts: [shift('2026-08-20', '22:00', '09:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(11)])],
    });
    const flag = flagsFor(result, 'overtime').find((f) => f.amountOre !== null);
    expect(flag).toBeDefined();
    expect(flag!.amountOre).toBe(15880); // 2,0 t × 198,50 × 40 %
  });
});

describe('hviletid', () => {
  it('flagger under 11 timer fri mellom to vakter', () => {
    // Vakt slutter 22:00, neste starter 06:00 -> 8 timer fri.
    const result = check({
      shifts: [shift('2026-08-17', '14:00', '22:00'), shift('2026-08-18', '06:00', '14:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(16)])],
    });
    const flag = flagsFor(result, 'rest_periods').find((f) => f.id.startsWith('rest_periods:daglig'));
    expect(flag).toBeDefined();
    expect(flag!.title).toContain('8,0 t');
    expect(flag!.severity).toBe('bor_sjekkes'); // 8 t er nedre grense ved avtale
  });

  it('flagger under 8 timer fri som sannsynlig feil', () => {
    const result = check({
      shifts: [shift('2026-08-17', '14:00', '22:00'), shift('2026-08-18', '04:00', '12:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(16)])],
    });
    const flag = flagsFor(result, 'rest_periods').find((f) => f.id.startsWith('rest_periods:daglig'));
    expect(flag!.severity).toBe('sannsynlig_feil');
    expect(flag!.title).toContain('6,0 t');
  });

  it('flagger for kort ukentlig friperiode', () => {
    // Vakter hver dag hele uka 08:00–14:00: lengste friperiode er 18 t, under 35 t.
    const shifts = ['17', '18', '19', '20', '21', '22', '23'].map((day) =>
      shift(`2026-08-${day}`, '08:00', '14:00'),
    );
    const result = check({
      contract: contract({ contractedHoursPerWeek: 42 }),
      shifts,
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(42)])],
    });
    const flag = flagsFor(result, 'rest_periods').find((f) => f.id === 'rest_periods:ukentlig:2026-W34');
    expect(flag).toBeDefined();
    expect(flag!.title).toContain('18,0 t');
  });

  it('flagger ikke to vakter med god nok hvile', () => {
    const result = check({
      shifts: [shift('2026-08-17', '08:00', '14:00'), shift('2026-08-18', '08:00', '14:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(12)])],
    });
    expect(flagsFor(result, 'rest_periods').filter((f) => f.id.includes('daglig'))).toHaveLength(0);
  });
});

describe('pauser', () => {
  it('flagger en vakt på 8 timer uten registrert pause', () => {
    const result = check({
      shifts: [shift('2026-08-20', '10:00', '18:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(8)])],
    });
    const flag = flagsFor(result, 'breaks')[0];
    expect(flag).toBeDefined();
    expect(flag!.title).toContain('Ingen pause registrert');
    expect(flag!.message).toContain('skal tiden regnes som arbeidstid');
    expect(flag!.amountOre).toBeNull();
  });

  it('flagger for kort pause på en lang vakt', () => {
    // 09:00–18:30 med 15 min pause = 9,25 t arbeidstid, men bare 15 min pause.
    const result = check({
      shifts: [shift('2026-08-20', '09:00', '18:30', { breakMinutes: 15 })],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(9.25)])],
    });
    const flag = flagsFor(result, 'breaks')[0];
    expect(flag!.title).toContain('Bare 15 minutter pause');
  });

  it('flagger ikke en kort vakt uten pause', () => {
    const result = check({
      shifts: [shift('2026-08-20', '10:00', '15:00')], // 5 t, under 5,5 t
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(5)])],
    });
    expect(flagsFor(result, 'breaks')).toHaveLength(0);
  });

  it('ser to vakter samme dag som én arbeidsdag', () => {
    // 08:00–12:00 og 13:00–17:00 = 8 t samme døgn, ingen pause registrert.
    const result = check({
      shifts: [shift('2026-08-20', '08:00', '12:00'), shift('2026-08-20', '13:00', '17:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(8)])],
    });
    expect(flagsFor(result, 'breaks')).toHaveLength(1);
    expect(flagsFor(result, 'breaks')[0]!.evidence.find((e) => e.label === 'Arbeidstid')!.value).toBe('8,0 t');
  });
});

describe('jobbet mot betalt', () => {
  it('krever grunnlønn for timer som ikke er betalt', () => {
    // Jobbet 20 t i august, betalt 16 t -> 4,0 t × 198,50 kr = 794,00 kr.
    const result = check({
      shifts: [
        shift('2026-08-17', '10:00', '20:00'), // 10 t
        shift('2026-08-19', '10:00', '20:00'), // 10 t
      ],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(16)])],
    });
    const flag = flagsFor(result, 'scheduled_vs_paid').find((f) => f.id.startsWith('scheduled_vs_paid:timer'));
    expect(flag).toBeDefined();
    expect(flag!.amountOre).toBe(79400);
    expect(flag!.calculation!.expression).toBe('4,0 t × 198,50 kr = 794,00 kr');
    expect(flag!.severity).toBe('sannsynlig_feil');
  });

  it('fordeler en vakt som krysser lønnsperioden på begge periodene', () => {
    // 31. august 22:00 – 1. september 06:00: 2 t i august, 6 t i september.
    // Augustslippen betaler 2 t, septemberslippen 6 t -> ingenting mangler.
    const result = check({
      shifts: [shift('2026-08-31', '22:00', '06:00')],
      payslips: [
        payslip('2026-08-01', '2026-08-31', [ordinaryLine(2)]),
        payslip('2026-09-01', '2026-09-30', [ordinaryLine(6)]),
      ],
    });
    expect(flagsFor(result, 'scheduled_vs_paid').filter((f) => f.id.includes('timer'))).toHaveLength(0);
  });

  it('flagger bare den perioden som mangler timer når vakta krysser', () => {
    // Samme vakt, men augustslippen betaler ingenting -> 2,0 t × 198,50 = 397,00 kr.
    const result = check({
      shifts: [shift('2026-08-31', '22:00', '06:00')],
      payslips: [
        payslip('2026-08-01', '2026-08-31', []),
        payslip('2026-09-01', '2026-09-30', [ordinaryLine(6)]),
      ],
    });
    const flags = flagsFor(result, 'scheduled_vs_paid').filter((f) => f.id.includes('timer'));
    expect(flags).toHaveLength(1);
    expect(flags[0]!.amountOre).toBe(39700);
    expect(flags[0]!.periodStart).toBe('2026-08-01');
  });

  it('flagger for lav timesats', () => {
    // Kontrakt 198,50 kr, lønnsslipp 185,00 kr, 20 t -> 20 × 13,50 = 270,00 kr.
    const result = check({
      shifts: [shift('2026-08-17', '10:00', '20:00'), shift('2026-08-19', '10:00', '20:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [line('ordinaer', 20, 18500, 370000, 'Timelønn')])],
    });
    const flag = flagsFor(result, 'scheduled_vs_paid').find((f) => f.id.includes('sats'));
    expect(flag).toBeDefined();
    expect(flag!.amountOre).toBe(27000);
    expect(formatKr(flag!.amountOre!)).toBe('270,00 kr');
  });

  it('sier fra når en måned mangler lønnsslipp', () => {
    // Augustvaktene strekker seg til 31. august, så hele måneden er dekket av data,
    // men vi har bare en julislipp.
    const result = check({
      shifts: [shift('2026-08-17', '10:00', '16:00'), shift('2026-08-31', '10:00', '16:00')],
      payslips: [payslip('2026-07-01', '2026-07-31', [ordinaryLine(10)])],
    });
    const flag = flagsFor(result, 'scheduled_vs_paid').find((f) => f.id.includes('mangler-lonnsslipp'));
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe('til_info');
    expect(flag!.amountOre).toBeNull();
  });
});

describe('tillegg', () => {
  it('sier fra når ingen tillegg er lagt inn, uten å gjette en sats', () => {
    const result = check({
      shifts: [shift('2026-08-20', '18:00', '23:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(5)])],
    });
    const flags = flagsFor(result, 'supplements');
    expect(flags).toHaveLength(1);
    expect(flags[0]!.severity).toBe('til_info');
    expect(flags[0]!.amountOre).toBeNull();
    expect(flags[0]!.message).toContain('ikke av');
  });

  it('krever kveldstillegg fra kontrakten', () => {
    // 18:00–23:00 = 5 t i vinduet, 25,00 kr/t -> 125,00 kr, ingenting betalt.
    const result = check({
      contract: contract({ supplements: [supplement()] }),
      shifts: [shift('2026-08-20', '18:00', '23:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(5)])],
    });
    const flag = flagsFor(result, 'supplements')[0];
    expect(flag!.amountOre).toBe(12500);
    expect(flag!.title).toContain('Kveldstillegg mangler');
    expect(flag!.evidence.find((e) => e.label === 'Kilde til satsen')!.value).toBe('Arbeidskontrakt pkt. 5');
  });

  it('krever helligdagstillegg i prosent på en helligdag', () => {
    // 17. mai 2026, 6 t jobbet, 100 % av 198,50 kr -> 1 191,00 kr.
    const result = check({
      contract: contract({
        supplements: [
          supplement({
            id: 'tillegg-helligdag',
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
    const flag = flagsFor(result, 'supplements')[0];
    expect(flag).toBeDefined();
    expect(flag!.amountOre).toBe(119100);
    expect(flag!.evidence[0]!.value).toContain('6,0 t × 100 % av timelønn');
  });

  it('godtar tillegg som er betalt', () => {
    const result = check({
      contract: contract({ supplements: [supplement()] }),
      shifts: [shift('2026-08-20', '18:00', '23:00')],
      payslips: [
        payslip(AUGUST.start, AUGUST.end, [ordinaryLine(5), line('kveldstillegg', 5, 2500, 12500, 'Kveldstillegg')]),
      ],
    });
    expect(flagsFor(result, 'supplements')).toHaveLength(0);
  });
});

describe('rett til større stilling', () => {
  it('flagger jevnlig merarbeid over mange uker', () => {
    // 50 % = 18,75 t/uke. 13 hele uker med 30 t -> snitt 30 t = 80 % av 37,5 t.
    const shifts = [];
    for (let week = 0; week < 13; week += 1) {
      for (const offset of [0, 1, 2, 3]) {
        const day = 1 + week * 7 + offset; // fra 1. juni 2026 (mandag)
        const date = new Date(Date.UTC(2026, 5, day)).toISOString().slice(0, 10);
        shifts.push(shift(date, '10:00', '18:00', { breakMinutes: 30 }));
      }
    }
    const result = check({
      shifts,
      payslips: [
        payslip('2026-06-01', '2026-06-30', [ordinaryLine(120)]),
        payslip('2026-07-01', '2026-07-31', [ordinaryLine(120)]),
        payslip('2026-08-01', '2026-08-31', [ordinaryLine(120)]),
      ],
    });
    const flag = flagsFor(result, 'actual_hours_vs_contract')[0];
    expect(flag).toBeDefined();
    expect(flag!.title).toContain('80 %');
    expect(flag!.message).toContain('tolv månedene');
    expect(flag!.evidence.find((e) => e.label === 'Faktisk snitt')!.value).toBe('30,0 t');
  });

  it('flagger ikke når vi har for få uker', () => {
    const result = check({
      shifts: [shift('2026-08-17', '10:00', '22:00'), shift('2026-08-18', '10:00', '22:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(24)])],
    });
    expect(flagsFor(result, 'actual_hours_vs_contract')).toHaveLength(0);
  });

  it('flagger ikke en 100 %-stilling', () => {
    const result = check({
      contract: contract({ stillingsprosent: 100 }),
      shifts: [shift('2026-08-17', '10:00', '16:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(6)])],
    });
    expect(flagsFor(result, 'actual_hours_vs_contract')).toHaveLength(0);
  });
});

describe('feriepenger', () => {
  it('sjekker avsetningen mot satsen', () => {
    // Grunnlag 100 000 kr × 10,2 % = 10 200 kr, men bare 8 000 kr er avsatt.
    const result = check({
      shifts: [shift('2026-08-17', '10:00', '16:00')],
      payslips: [
        payslip(AUGUST.start, AUGUST.end, [ordinaryLine(6)], {
          feriepengerBasisOre: 10_000_000,
          feriepengerAccruedOre: 800_000,
        }),
      ],
    });
    const flag = flagsFor(result, 'feriepenger').find((f) => f.id.includes('avsetning'));
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe('bor_sjekkes');
    expect(flag!.calculation!.expression).toBe('100 000,00 kr × 10,2 % = 10 200,00 kr');
    expect(flag!.amountOre).toBe(220_000);
  });

  it('bruker 12 % når kontrakten sier fem uker ferie', () => {
    const result = check({
      contract: contract({ feriepengerRatePercent: 12 }),
      shifts: [shift('2026-08-17', '10:00', '16:00')],
      payslips: [
        payslip(AUGUST.start, AUGUST.end, [ordinaryLine(6)], {
          feriepengerBasisOre: 10_000_000,
          feriepengerAccruedOre: 1_020_000,
        }),
      ],
    });
    const flag = flagsFor(result, 'feriepenger').find((f) => f.id.includes('avsetning'));
    expect(flag!.calculation!.expression).toBe('100 000,00 kr × 12 % = 12 000,00 kr');
  });

  it('sier fra når grunnlaget ikke står på lønnsslippen', () => {
    const result = check({
      shifts: [shift('2026-08-17', '10:00', '16:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(6)])],
    });
    const flags = flagsFor(result, 'feriepenger');
    expect(flags).toHaveLength(1);
    expect(flags[0]!.severity).toBe('til_info');
    expect(flags[0]!.amountOre).toBeNull();
  });
});

describe('motoren', () => {
  it('sier hva som mangler når vi ikke har nok data', () => {
    const result = check({ contract: null, shifts: [], payslips: [] });
    expect(result.blockers).toHaveLength(3);
    expect(result.flags).toHaveLength(0);
    expect(result.totals.estimatedOwedOre).toBe(0);
  });

  it('holder krav om ubetalt arbeid og manglende timer i hver sin sum', () => {
    const result = check({
      contract: contract({ contractedHoursPerWeek: 20 }),
      shifts: [shift('2026-08-17', '10:00', '20:00'), shift('2026-08-19', '10:00', '20:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(16)])],
    });
    // To vakter på 10 t: 20 t jobbet, 16 t betalt.
    //   ubetalt grunnlønn  4,0 t × 198,50 kr            = 794,00 kr
    //   overtidstillegg    2,0 t × 198,50 kr × 40 %     = 158,80 kr  (1 t over 9 t per vakt)
    //                                                     ---------
    //                                                     952,80 kr
    expect(result.totals.estimatedOwedOre).toBe(95280);
    // Manglende timer mot stillingsprosent holdes utenfor den summen.
    expect(result.totals.underScheduledOre).toBeGreaterThan(0);
    expect(result.totals.estimatedOwedOre).not.toBe(
      result.totals.estimatedOwedOre + result.totals.underScheduledOre,
    );
  });

  it('sorterer flaggene med det alvorligste først', () => {
    const result = check({
      contract: contract({ contractedHoursPerWeek: 20 }),
      shifts: [shift('2026-08-17', '10:00', '20:00'), shift('2026-08-19', '10:00', '20:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(16)])],
    });
    const order = result.flags.map((flag) => flag.severity);
    const sorted = [...order].sort(
      (a, b) => ({ sannsynlig_feil: 0, bor_sjekkes: 1, til_info: 2 })[a] - ({ sannsynlig_feil: 0, bor_sjekkes: 1, til_info: 2 })[b],
    );
    expect(order).toEqual(sorted);
  });

  it('gir samme resultat hver gang', () => {
    const parts = {
      shifts: [shift('2026-08-17', '10:00', '20:00'), shift('2026-08-20', '22:00', '06:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(12)])],
    };
    expect(JSON.stringify(check(parts))).toBe(JSON.stringify(check(parts)));
  });

  it('bygger en tidslinje med uker, plan og lønnsperiode', () => {
    const result = check({
      contract: contract({ contractedHoursPerWeek: 20 }),
      shifts: [shift('2026-08-17', '10:00', '16:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(6)])],
    });
    const week = result.timeline.find((entry) => entry.key === '2026-W34')!;
    expect(week.contractedHours).toBe(20);
    expect(week.plannedHours).toBe(6);
    expect(week.workedHours).toBe(6);
    // Månedslønnsslippen dekker ikke akkurat denne uka, så betalte timer står åpent.
    expect(week.paidHours).toBeNull();
    expect(week.payslipLabels).toEqual(['Lønn for august 2026']);
    expect(week.complete).toBe(true);
    expect(week.flagIds.length).toBeGreaterThan(0);
  });
});
