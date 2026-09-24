/**
 * The provisions added in the second round: Sunday and holiday work (§ 10-10), night work
 * (§ 10-11), deductions from pay (§ 14-15), temporary employment (§ 14-9), the contract's
 * required contents (§ 14-6, § 10-7, § 10-3), holiday itself (ferieloven § 5, § 7), minimum
 * wage in a generally applied industry, the § 10-12 exemption, and time off in lieu of
 * overtime (§ 10-6).
 */
import { describe, expect, it } from 'vitest';
import { check, contract, flagsFor, line, ordinaryLine, payslip, shift } from './fixtures';

const AUGUST = { start: '2026-08-01', end: '2026-08-31' };

/** A run of weeks of Sunday shifts, to exercise the every-other-Sunday rule. */
function sundays(dates: readonly string[]) {
  return dates.map((date) => shift(date, '10:00', '18:00', { breakMinutes: 30 }));
}

describe('søndagsarbeid (§ 10-10)', () => {
  it('flagger to søndager på rad når det ikke finnes en skriftlig avtale', () => {
    const result = check({
      contract: contract({ contractedHoursPerWeek: 8 }),
      shifts: sundays(['2026-08-09', '2026-08-16', '2026-08-23']),
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(22.5)])],
    });
    const flag = flagsFor(result, 'sunday_work').find((f) => f.id.includes('annenhver-sondag'))!;
    expect(flag).toBeDefined();
    expect(flag.severity).toBe('bor_sjekkes');
    expect(flag.title).toContain('flere søndager på rad');
    expect(flag.evidence.find((e) => e.label === 'Søndager på rad')!.value).toBe('2');
    expect(flag.amountOre).toBeNull();
  });

  it('nedgraderer til info når kontrakten har en skriftlig søndagsavtale', () => {
    const result = check({
      contract: contract({ contractedHoursPerWeek: 8, sundayWorkAgreement: true }),
      shifts: sundays(['2026-08-09', '2026-08-16', '2026-08-23']),
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(22.5)])],
    });
    const flag = flagsFor(result, 'sunday_work').find((f) => f.id.includes('annenhver-sondag'))!;
    expect(flag.severity).toBe('til_info');
    expect(flag.evidence.find((e) => e.label === 'Skriftlig avtale oppgitt')!.value).toBe('Ja');
  });

  it('godtar annenhver søndag', () => {
    const result = check({
      contract: contract({ contractedHoursPerWeek: 8 }),
      shifts: sundays(['2026-08-09', '2026-08-23']),
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(15)])],
    });
    const flags = flagsFor(result, 'sunday_work');
    expect(flags).toHaveLength(1);
    expect(flags[0]!.severity).toBe('til_info');
    expect(flags[0]!.title).toContain('2 søn- eller helgedager');
  });
});

describe('nattarbeid (§ 10-11)', () => {
  it('regner timene mellom 21 og 06 som nattarbeid', () => {
    const result = check({
      contract: contract({ contractedHoursPerWeek: 8 }),
      shifts: [shift('2026-08-20', '22:00', '06:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(8)])],
    });
    const flag = flagsFor(result, 'night_work').find((f) => f.id.includes('nattarbeid'))!;
    expect(flag.title).toBe('8,0 t nattarbeid i perioden');
  });

  it('kaller deg nattarbeidstaker først når nattvaktene er jevnlige', () => {
    const one = check({
      contract: contract({ contractedHoursPerWeek: 8 }),
      shifts: [shift('2026-08-20', '22:00', '06:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(8)])],
    });
    expect(
      flagsFor(one, 'night_work')[0]!.evidence.find((e) => e.label === 'Regnes som nattarbeidstaker')!.value,
    ).toBe('Nei');

    const many = check({
      contract: contract({ contractedHoursPerWeek: 32 }),
      shifts: [
        shift('2026-08-17', '22:00', '06:00'),
        shift('2026-08-19', '22:00', '06:00'),
        shift('2026-08-21', '22:00', '06:00'),
        shift('2026-08-24', '22:00', '06:00'),
      ],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(32)])],
    });
    const flag = flagsFor(many, 'night_work').find((f) => f.id.includes('nattarbeid'))!;
    expect(flag.evidence.find((e) => e.label === 'Regnes som nattarbeidstaker')!.value).toBe('Ja');
    expect(flag.severity).toBe('bor_sjekkes');
  });

  it('sier ingenting når ingen jobber om natten', () => {
    const result = check({
      shifts: [shift('2026-08-20', '10:00', '18:00', { breakMinutes: 30 })],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(7.5)])],
    });
    expect(flagsFor(result, 'night_work')).toHaveLength(0);
  });
});

describe('trekk i lønn (§ 14-15)', () => {
  it('flagger et trekk og forklarer hva som er lovlig', () => {
    const result = check({
      shifts: [shift('2026-08-17', '10:00', '16:00')],
      payslips: [
        payslip(AUGUST.start, AUGUST.end, [
          ordinaryLine(6),
          line('trekk', null, null, 50000, 'Trekk for uniform'),
        ]),
      ],
    });
    const flag = flagsFor(result, 'wage_deductions')[0]!;
    expect(flag.title).toBe('500,00 kr er trukket fra lønna');
    expect(flag.message).toContain('Høyesterett');
    expect(flag.message).toContain('nok igjen å leve av');
    // Vi krever ikke pengene tilbake automatisk: lovligheten avhenger av avtalen.
    expect(flag.amountOre).toBeNull();
  });

  it('fanger også et negativt beløp som ikke er merket som trekk', () => {
    const result = check({
      shifts: [shift('2026-08-17', '10:00', '16:00')],
      payslips: [
        payslip(AUGUST.start, AUGUST.end, [ordinaryLine(6), line('annet', null, null, -25000, 'Kassedifferanse')]),
      ],
    });
    expect(flagsFor(result, 'wage_deductions')).toHaveLength(1);
  });

  it('flagger ikke en vanlig lønnsslipp uten trekk', () => {
    const result = check({
      shifts: [shift('2026-08-17', '10:00', '16:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(6)])],
    });
    expect(flagsFor(result, 'wage_deductions')).toHaveLength(0);
  });
});

describe('midlertidig ansettelse (§ 14-9)', () => {
  it('sier fra når grunnlaget for midlertidigheten mangler', () => {
    const result = check({
      contract: contract({ employmentType: 'midlertidig', temporaryBasis: null, startDate: '2026-01-01' }),
      shifts: [shift('2026-08-17', '10:00', '16:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(6)])],
    });
    const flag = flagsFor(result, 'temporary_employment').find((f) => f.id.includes('mangler-grunnlag'))!;
    expect(flag).toBeDefined();
    expect(flag.message).toContain('regnes som fast');
  });

  it('peker på treårsregelen', () => {
    const result = check({
      contract: contract({ employmentType: 'midlertidig', temporaryBasis: 'Vikar for fast ansatt', startDate: '2022-01-01' }),
      shifts: [shift('2026-08-17', '10:00', '16:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(6)])],
    });
    const flag = flagsFor(result, 'temporary_employment').find((f) => f.id.includes('treaarsregelen'))!;
    expect(flag).toBeDefined();
    expect(flag.title).toContain('over 3 år');
    // Grunnlaget står i kontrakten, så det andre funnet skal ikke komme.
    expect(flagsFor(result, 'temporary_employment')).toHaveLength(1);
  });

  it('sier ingenting til en fast ansatt', () => {
    const result = check({
      shifts: [shift('2026-08-17', '10:00', '16:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(6)])],
    });
    expect(flagsFor(result, 'temporary_employment')).toHaveLength(0);
  });
});

describe('minstelønn (allmenngjøringsloven)', () => {
  it('krever differansen når timelønna er under satsen brukeren har lagt inn', () => {
    // 6 t jobbet, kontrakt 198,50 kr, minstelønn 220,00 kr -> 6 × 21,50 = 129,00 kr.
    const result = check({
      contract: contract({ allmenngjortMinimumHourlyOre: 22000, industry: 'Servering' }),
      shifts: [shift('2026-08-17', '10:00', '16:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(6)])],
    });
    const flag = flagsFor(result, 'minimum_wage')[0]!;
    expect(flag.severity).toBe('sannsynlig_feil');
    expect(flag.amountOre).toBe(12900);
    expect(flag.calculation!.expression).toBe('6 t × 21,50 kr = 129,00 kr');
  });

  it('gjetter ingen sats, men sier hvor den finnes', () => {
    const result = check({
      contract: contract({ industry: 'Renhold' }),
      shifts: [shift('2026-08-17', '10:00', '16:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(6)])],
    });
    const flag = flagsFor(result, 'minimum_wage')[0]!;
    expect(flag.severity).toBe('til_info');
    expect(flag.amountOre).toBeNull();
  });

  it('sier ingenting for en bransje uten allmenngjort tariff', () => {
    const result = check({
      contract: contract({ industry: 'Kontor og administrasjon' }),
      shifts: [shift('2026-08-17', '10:00', '16:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(6)])],
    });
    expect(flagsFor(result, 'minimum_wage')).toHaveLength(0);
  });

  it('flagger ikke når lønna er over satsen', () => {
    const result = check({
      contract: contract({ allmenngjortMinimumHourlyOre: 18000, industry: 'Servering' }),
      shifts: [shift('2026-08-17', '10:00', '16:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(6)])],
    });
    expect(flagsFor(result, 'minimum_wage')).toHaveLength(0);
  });
});

describe('unntak fra arbeidstidsreglene (§ 10-12)', () => {
  const busyWeek = {
    shifts: [
      shift('2026-08-17', '08:00', '20:00'),
      shift('2026-08-18', '08:00', '20:00'),
      shift('2026-08-19', '08:00', '20:00'),
      shift('2026-08-20', '08:00', '20:00'),
    ],
    payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(48)])],
  };

  it('slår av arbeidstidsreglene for en særlig uavhengig stilling, og sier hvilke', () => {
    const exempt = check({
      contract: contract({ workingTimeExemption: 'saerlig_uavhengig', contractedHoursPerWeek: 48 }),
      ...busyWeek,
    });
    for (const ruleId of ['overtime', 'rest_periods', 'breaks', 'sunday_work', 'night_work'] as const) {
      expect(flagsFor(exempt, ruleId), ruleId).toHaveLength(0);
    }
    const flag = flagsFor(exempt, 'working_time_exemption')[0]!;
    expect(flag.severity).toBe('bor_sjekkes');
    expect(flag.message).toContain('smalere enn mange tror');
    expect(flag.evidence.find((e) => e.label === 'Sjekker som er slått av')!.value).toContain('Overtid');
  });

  it('beholder alle arbeidstidsreglene for en vanlig stilling', () => {
    const ordinary = check({ contract: contract({ contractedHoursPerWeek: 48 }), ...busyWeek });
    expect(flagsFor(ordinary, 'overtime').length).toBeGreaterThan(0);
    expect(flagsFor(ordinary, 'breaks').length).toBeGreaterThan(0);
    expect(flagsFor(ordinary, 'working_time_exemption')).toHaveLength(0);
  });

  it('sjekker fortsatt lønn og tillegg for en unntatt stilling', () => {
    const exempt = check({
      contract: contract({ workingTimeExemption: 'ledende', contractedHoursPerWeek: 48 }),
      shifts: busyWeek.shifts,
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(40)])],
    });
    // 8 t jobbet uten betaling skal fortsatt kreves.
    expect(flagsFor(exempt, 'scheduled_vs_paid').filter((f) => f.id.includes('timer'))).toHaveLength(1);
  });
});

describe('avspasering av overtid (§ 10-6)', () => {
  it('krever tillegget i penger selv om timene er tatt ut som fri', () => {
    // 2 t avspasert overtid, 40 % av 198,50 kr -> 158,80 kr.
    const result = check({
      shifts: [shift('2026-08-20', '08:00', '19:00')],
      payslips: [
        payslip(AUGUST.start, AUGUST.end, [
          ordinaryLine(9),
          line('avspasering', 2, null, 0, 'Avspasert overtid'),
        ]),
      ],
    });
    const flag = flagsFor(result, 'overtime').find((f) => f.id.includes('avspasering'))!;
    expect(flag).toBeDefined();
    expect(flag.amountOre).toBe(15880);
    expect(flag.message).toContain('kan ikke avspaseres bort');
  });

  it('krever ingenting når tillegget alt er betalt', () => {
    const result = check({
      shifts: [shift('2026-08-20', '08:00', '19:00')],
      payslips: [
        payslip(AUGUST.start, AUGUST.end, [
          ordinaryLine(9),
          line('avspasering', 2, null, 0, 'Avspasert overtid'),
          line('overtid_40', 2, 7940, 15880, 'Overtidstillegg 40 %'),
        ]),
      ],
    });
    expect(flagsFor(result, 'overtime').filter((f) => f.id.includes('avspasering'))).toHaveLength(0);
  });
});

describe('ferie (ferieloven § 5 og § 7)', () => {
  it('sier fra når vi ikke finner hovedferie i sommerperioden', () => {
    const shifts = [];
    for (let week = 0; week < 12; week += 1) {
      const day = 1 + week * 7;
      const date = new Date(Date.UTC(2026, 5, day)).toISOString().slice(0, 10);
      shifts.push(shift(date, '10:00', '18:00', { breakMinutes: 30 }));
      shifts.push(shift(new Date(Date.UTC(2026, 5, day + 2)).toISOString().slice(0, 10), '10:00', '18:00', { breakMinutes: 30 }));
    }
    const result = check({
      contract: contract({ contractedHoursPerWeek: 15 }),
      shifts,
      payslips: [
        payslip('2026-06-01', '2026-06-30', [ordinaryLine(60)]),
        payslip('2026-07-01', '2026-07-31', [ordinaryLine(60)]),
        payslip('2026-08-01', '2026-08-31', [ordinaryLine(45)]),
      ],
    });
    const flag = flagsFor(result, 'holiday')[0]!;
    expect(flag).toBeDefined();
    expect(flag.severity).toBe('til_info');
    expect(flag.evidence.find((e) => e.label === 'Ferie i året til sammen')!.value).toBe('25 virkedager');
  });

  it('sier ingenting når det finnes en luke lang nok til å være ferie', () => {
    const shifts = [
      shift('2026-06-01', '10:00', '18:00', { breakMinutes: 30 }),
      shift('2026-06-08', '10:00', '18:00', { breakMinutes: 30 }),
      // Fire uker uten vakter midt i hovedferieperioden.
      shift('2026-07-20', '10:00', '18:00', { breakMinutes: 30 }),
      shift('2026-07-27', '10:00', '18:00', { breakMinutes: 30 }),
      shift('2026-08-03', '10:00', '18:00', { breakMinutes: 30 }),
      shift('2026-08-10', '10:00', '18:00', { breakMinutes: 30 }),
      shift('2026-08-17', '10:00', '18:00', { breakMinutes: 30 }),
      shift('2026-08-24', '10:00', '18:00', { breakMinutes: 30 }),
    ];
    const result = check({
      contract: contract({ contractedHoursPerWeek: 7.5 }),
      shifts,
      payslips: [
        payslip('2026-06-01', '2026-06-30', [ordinaryLine(15)]),
        payslip('2026-07-01', '2026-07-31', [ordinaryLine(15)]),
        payslip('2026-08-01', '2026-08-31', [ordinaryLine(30)]),
      ],
    });
    expect(flagsFor(result, 'holiday')).toHaveLength(0);
  });
});

describe('arbeidsavtalens innhold (§ 14-6, § 10-7, § 10-3)', () => {
  it('lister det som mangler, uten å påstå at avtalen er ugyldig', () => {
    const result = check({
      contract: contract({ jobTitle: null, workplace: null, payDayOfMonth: null }),
      shifts: [shift('2026-08-17', '10:00', '16:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(6)])],
    });
    const flag = flagsFor(result, 'contract_contents').find((f) => f.id.includes('mangler-opplysninger'))!;
    expect(flag.severity).toBe('til_info');
    expect(flag.message).toContain('senest sju dager');
    expect(flag.evidence.map((e) => e.label)).toContain('Arbeidsplass');
    expect(flag.evidence.map((e) => e.label)).toContain('Utbetalingsmåte og -tidspunkt');
  });

  it('minner om retten til en oversikt over arbeidstiden når vi ikke har vakter', () => {
    const result = check({
      shifts: [],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(6)])],
    });
    const flag = flagsFor(result, 'contract_contents').find((f) => f.id.includes('oversikt'))!;
    expect(flag).toBeDefined();
    expect(flag.message).toContain('Arbeidstilsynet');
  });

  it('minner om arbeidsplan to uker i forveien når det finnes planlagte vakter', () => {
    const result = check({
      shifts: [shift('2026-08-17', '10:00', '16:00', { kind: 'planlagt' })],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(6)])],
    });
    const flag = flagsFor(result, 'contract_contents').find((f) => f.id.includes('arbeidsplan'))!;
    expect(flag).toBeDefined();
    expect(flag.message).toContain('to uker');
  });
});
