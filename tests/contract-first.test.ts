/**
 * The contract is the primary source for every rule.
 *
 * One test per rule: the contract's own term is used and shown as coming from the contract,
 * the law applies only where the contract is silent, and a contract term weaker than the
 * law's floor is raised to the floor and reported as a finding of its own.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_RULESET, ruleById } from '@/domain/ruleset';
import * as thresholds from '@/domain/thresholds';
import { check, contract, flagsFor, line, ordinaryLine, payslip, shift, supplement } from './fixtures';

const AUGUST = { start: '2026-08-01', end: '2026-08-31' };
const overtimeRule = ruleById(DEFAULT_RULESET, 'overtime')!;
const restRule = ruleById(DEFAULT_RULESET, 'rest_periods')!;
const breaksRule = ruleById(DEFAULT_RULESET, 'breaks')!;
const feriepengerRule = ruleById(DEFAULT_RULESET, 'feriepenger')!;
const positionRule = ruleById(DEFAULT_RULESET, 'actual_hours_vs_contract')!;

describe('hvor terskelen kommer fra', () => {
  it('bruker loven når kontrakten ikke sier noe', () => {
    const resolved = thresholds.overtimeSupplementPercent(contract(), overtimeRule);
    expect(resolved).toMatchObject({ value: 40, source: 'lov', label: 'arbeidsmiljøloven § 10-6' });
    expect(resolved.belowStatutory).toBeNull();
  });

  it('bruker kontrakten når den er bedre enn loven', () => {
    const resolved = thresholds.overtimeSupplementPercent(
      contract({ overtimeSupplementPercent: 50 }),
      overtimeRule,
    );
    expect(resolved).toMatchObject({ value: 50, source: 'kontrakt', label: 'fra kontrakten din' });
  });

  it('løfter et kontraktsvilkår som er dårligere enn lovens gulv', () => {
    const resolved = thresholds.overtimeSupplementPercent(
      contract({ overtimeSupplementPercent: 25 }),
      overtimeRule,
    );
    expect(resolved.value).toBe(40);
    expect(resolved.source).toBe('lov');
    expect(resolved.belowStatutory).toEqual({ contractValue: 25, statutory: 40 });
  });

  it('lar kontrakten sette arbeidstidsgrensene fritt, i begge retninger', () => {
    // § 10-5 gjør at gjennomsnittsberegning kan heve døgngrensen, så her er ikke loven et gulv.
    expect(thresholds.dailyLimit(contract({ normalDailyLimitHours: 10 }), overtimeRule).value).toBe(10);
    expect(thresholds.dailyLimit(contract({ normalDailyLimitHours: 8 }), overtimeRule)).toMatchObject({
      value: 8,
      source: 'kontrakt',
    });
    expect(thresholds.weeklyLimit(contract({ normalWeeklyLimitHours: 37.5 }), overtimeRule).value).toBe(37.5);
  });

  it('holder avtalt arbeidsfri over lovens nedre grense', () => {
    expect(thresholds.dailyRest(contract({ agreedDailyRestHours: 9 }), restRule)).toMatchObject({
      value: 9,
      source: 'kontrakt',
    });
    const tooLow = thresholds.dailyRest(contract({ agreedDailyRestHours: 6 }), restRule);
    expect(tooLow.value).toBe(8);
    expect(tooLow.belowStatutory).toEqual({ contractValue: 6, statutory: 8 });
    const weekly = thresholds.weeklyRest(contract({ agreedWeeklyRestHours: 20 }), restRule);
    expect(weekly.value).toBe(28);
  });

  it('godtar en kontrakt som krever pause tidligere, men ikke senere', () => {
    expect(
      thresholds.breakRequiredAfterHours(contract({ breakRequiredAfterHours: 4 }), breaksRule),
    ).toMatchObject({ value: 4, source: 'kontrakt' });
    const later = thresholds.breakRequiredAfterHours(contract({ breakRequiredAfterHours: 7 }), breaksRule);
    expect(later.value).toBe(5.5);
    expect(later.belowStatutory).toEqual({ contractValue: 7, statutory: 5.5 });
    expect(
      thresholds.minBreakMinutesLongDay(contract({ minBreakMinutesLongDay: 45 }), breaksRule),
    ).toMatchObject({ value: 45, source: 'kontrakt' });
  });

  it('bruker kontraktens feriepengesats, men aldri under ferielovens', () => {
    expect(thresholds.feriepengerRatePercent(contract({ feriepengerRatePercent: 12 }), feriepengerRule)).toMatchObject({
      value: 12,
      source: 'kontrakt',
    });
    expect(thresholds.feriepengerRatePercent(contract(), feriepengerRule)).toMatchObject({
      value: 10.2,
      source: 'lov',
    });
    expect(
      thresholds.feriepengerRatePercent(contract({ feriepengerRatePercent: 8 }), feriepengerRule).value,
    ).toBe(10.2);
  });

  it('lar tariffen gi rett til større stilling tidligere enn loven', () => {
    expect(
      thresholds.largerPositionLookbackMonths(contract({ largerPositionLookbackMonths: 6 }), positionRule),
    ).toMatchObject({ value: 6, source: 'kontrakt' });
  });
});

describe('reglene bruker kontrakten', () => {
  it('overtid: regner tillegget med kontraktens sats og sier hvor den kom fra', () => {
    // 11 t vakt = 2 t over 9 t. Kontrakten gir 100 %: 2,0 t × 198,50 kr × 100 % = 397,00 kr.
    const result = check({
      contract: contract({ overtimeSupplementPercent: 100 }),
      shifts: [shift('2026-08-20', '08:00', '19:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(11)])],
    });
    const flag = flagsFor(result, 'overtime').find((f) => f.amountOre !== null)!;
    expect(flag.amountOre).toBe(39700);
    expect(flag.calculation!.expression).toBe('2,0 t × 198,50 kr × 100 % = 397,00 kr');
    expect(flag.evidence.find((e) => e.label === 'Tillegg')!.value).toBe('100 % (fra kontrakten din)');
  });

  it('overtid: bruker kontraktens døgngrense', () => {
    // Kontrakten avtaler 10 t per døgn (gjennomsnittsberegning), så en vakt på 11 t gir 1 t overtid.
    const result = check({
      contract: contract({ normalDailyLimitHours: 10, averagingAgreement: true }),
      shifts: [shift('2026-08-20', '08:00', '19:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(11)])],
    });
    const flag = flagsFor(result, 'overtime').find((f) => f.amountOre !== null)!;
    expect(flag.calculation!.expression).toBe('1,0 t × 198,50 kr × 40 % = 79,40 kr');
    expect(flag.evidence.find((e) => e.label === 'Grense per arbeidsdøgn')!.value).toBe(
      '10,0 t (fra kontrakten din)',
    );
  });

  it('overtid: sier fra når en høyere grense mangler avtale om gjennomsnittsberegning', () => {
    const result = check({
      contract: contract({ normalDailyLimitHours: 10, averagingAgreement: false }),
      shifts: [shift('2026-08-20', '08:00', '19:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(11)])],
    });
    const flag = flagsFor(result, 'overtime').find((f) => f.id.includes('hoyere-grense-uten-avtale'))!;
    expect(flag).toBeDefined();
    expect(flag.message).toContain('gjennomsnittsberegning');
    expect(flag.amountOre).toBeNull();
  });

  it('overtid: flagger en kontrakt som lover mindre enn 40 %', () => {
    const result = check({
      contract: contract({ overtimeSupplementPercent: 25 }),
      shifts: [shift('2026-08-20', '08:00', '19:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(11)])],
    });
    const flag = flagsFor(result, 'overtime').find((f) => f.id.includes('tillegg-under-lovens-minimum'))!;
    expect(flag).toBeDefined();
    expect(flag.message).toContain('ikke gyldig');
    // Og utregningen bruker lovens 40 %, ikke kontraktens 25 %.
    const claim = flagsFor(result, 'overtime').find((f) => f.amountOre !== null)!;
    expect(claim.calculation!.expression).toBe('2,0 t × 198,50 kr × 40 % = 158,80 kr');
  });

  it('overtid: krever differansen når overtidssatsen på slippen er for lav', () => {
    // Kontrakten gir 50 %: satsen skal være 297,75 kr. Slippen betaler 250,00 kr for 2 t.
    // 2,0 t × (297,75 − 250,00) = 95,50 kr.
    const result = check({
      contract: contract({ overtimeSupplementPercent: 50 }),
      shifts: [shift('2026-08-20', '08:00', '19:00')],
      payslips: [
        payslip(AUGUST.start, AUGUST.end, [
          ordinaryLine(9),
          line('overtid_40', 2, 25000, 50000, 'Overtid'),
        ]),
      ],
    });
    const flag = flagsFor(result, 'overtime').find((f) => f.id.includes('sats:'))!;
    expect(flag).toBeDefined();
    expect(flag.amountOre).toBe(9550);
    expect(flag.calculation!.expression).toBe('2,0 t × (297,75 kr − 250,00 kr) = 95,50 kr');
  });

  it('hviletid: bruker kontraktens avtalte arbeidsfri', () => {
    // Kontrakten avtaler 9 t fri. 9,5 t mellom vaktene er da greit.
    const ok = check({
      contract: contract({ agreedDailyRestHours: 9 }),
      shifts: [shift('2026-08-17', '14:00', '22:00'), shift('2026-08-18', '07:30', '14:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(14.5)])],
    });
    expect(flagsFor(ok, 'rest_periods').filter((f) => f.id.includes('daglig'))).toHaveLength(0);

    // Uten avtalen er lovens 11 t kravet, og da er samme vakt et funn.
    const flagged = check({
      shifts: [shift('2026-08-17', '14:00', '22:00'), shift('2026-08-18', '07:30', '14:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(14.5)])],
    });
    const flag = flagsFor(flagged, 'rest_periods').find((f) => f.id.includes('daglig'))!;
    expect(flag.evidence.find((e) => e.label === 'Kravet vi måler mot')!.value).toBe(
      '11,0 t (arbeidsmiljøloven § 10-8)',
    );
  });

  it('hviletid: flagger en avtale under lovens gulv på 8 timer', () => {
    const result = check({
      contract: contract({ agreedDailyRestHours: 6 }),
      shifts: [shift('2026-08-17', '14:00', '22:00'), shift('2026-08-18', '10:00', '14:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(12)])],
    });
    const flag = flagsFor(result, 'rest_periods').find((f) => f.id.includes('avtale-under-lovens-gulv'))!;
    expect(flag).toBeDefined();
    expect(flag.message).toContain('kan ikke gå under 8,0 t');
  });

  it('pauser: bruker kontraktens pausekrav', () => {
    // Kontrakten krever 45 min pause på lange vakter; 30 min er da for kort.
    const result = check({
      contract: contract({ minBreakMinutesLongDay: 45 }),
      shifts: [shift('2026-08-20', '09:00', '18:30', { breakMinutes: 30 })],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(9)])],
    });
    const flag = flagsFor(result, 'breaks')[0]!;
    expect(flag.title).toContain('Bare 30 minutter pause');
    expect(flag.evidence.find((e) => e.label === 'Kravet vi måler mot')!.value).toContain('fra kontrakten din');
  });

  it('pauser: betalt pause teller som arbeidstid', () => {
    // 10:00–18:30 med 30 min pause. Med betalt pause er det 8,5 t som skal betales, ikke 8,0 t.
    const paid = check({
      contract: contract({ paidBreak: true }),
      shifts: [shift('2026-08-20', '10:00', '18:30', { breakMinutes: 30 })],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(8)])],
    });
    const flag = flagsFor(paid, 'scheduled_vs_paid').find((f) => f.id.includes('timer'))!;
    expect(flag).toBeDefined();
    expect(flag.calculation!.expression).toBe('0,5 t × 198,50 kr = 99,25 kr');
    expect(flag.evidence.some((e) => e.value.includes('pausene er betalt'))).toBe(true);

    // Uten betalt pause er 8,0 t riktig, og ingenting mangler.
    const unpaid = check({
      shifts: [shift('2026-08-20', '10:00', '18:30', { breakMinutes: 30 })],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(8)])],
    });
    expect(flagsFor(unpaid, 'scheduled_vs_paid').filter((f) => f.id.includes('timer'))).toHaveLength(0);
  });

  it('pauser: en betalt pause skjuler ikke at pausen mangler', () => {
    const result = check({
      contract: contract({ paidBreak: true }),
      shifts: [shift('2026-08-20', '10:00', '18:00', { breakMinutes: 0 })],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(8)])],
    });
    const flag = flagsFor(result, 'breaks')[0]!;
    expect(flag.title).toContain('Ingen pause registrert');
    expect(flag.evidence.find((e) => e.label === 'Pausen er betalt')!.value).toContain('Ja');
  });

  it('feriepenger: bruker kontraktens sats og sier hvor den kom fra', () => {
    const result = check({
      contract: contract({ feriepengerRatePercent: 12 }),
      shifts: [shift('2026-08-17', '10:00', '16:00')],
      payslips: [
        payslip(AUGUST.start, AUGUST.end, [ordinaryLine(6)], {
          feriepengerBasisOre: 10_000_000,
          feriepengerAccruedOre: 1_000_000,
        }),
      ],
    });
    const flag = flagsFor(result, 'feriepenger').find((f) => f.id.includes('avsetning'))!;
    expect(flag.evidence.find((e) => e.label === 'Sats vi bruker')!.value).toBe('12 % (fra kontrakten din)');
  });

  it('feriepenger: flagger en sats under ferielovens minimum', () => {
    const result = check({
      contract: contract({ feriepengerRatePercent: 8 }),
      shifts: [shift('2026-08-17', '10:00', '16:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(6)])],
    });
    const flag = flagsFor(result, 'feriepenger').find((f) => f.id.includes('sats-under-lovens-minimum'))!;
    expect(flag).toBeDefined();
    expect(flag.evidence.find((e) => e.label === 'Lovens minimum')!.value).toBe('10,2 %');
  });

  it('tillegg: sier tydelig at satsen kommer fra kontrakten, ikke loven', () => {
    const result = check({
      contract: contract({ supplements: [supplement()] }),
      shifts: [shift('2026-08-20', '18:00', '23:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(5)])],
    });
    const flag = flagsFor(result, 'supplements')[0]!;
    expect(flag.evidence.find((e) => e.label === 'Hvor satsen kommer fra')!.value).toContain(
      'ikke arbeidsmiljøloven',
    );
  });

  it('mister ikke funn om kontraktsvilkår når regelen tar en snarvei ut', () => {
    // feriepenger-regelen returnerer tidlig når lønnsslippen ikke oppgir noe grunnlag. Da
    // skal funnet om at kontraktens sats er for lav fortsatt være med.
    const result = check({
      contract: contract({ feriepengerRatePercent: 8 }),
      shifts: [shift('2026-08-17', '10:00', '16:00')],
      payslips: [payslip(AUGUST.start, AUGUST.end, [ordinaryLine(6)])],
    });
    const ids = flagsFor(result, 'feriepenger').map((flag) => flag.id);
    expect(ids).toContain('feriepenger:sats-under-lovens-minimum');
    expect(ids).toContain('feriepenger:ikke-oppgitt');
  });

  it('alle åtte reglene kjører fortsatt, uansett hva kontrakten sier', () => {
    const everything = check({
      contract: contract({
        overtimeSupplementPercent: 50,
        agreedDailyRestHours: 9,
        minBreakMinutesLongDay: 45,
        feriepengerRatePercent: 12,
        largerPositionLookbackMonths: 6,
        paidBreak: true,
        supplements: [supplement()],
      }),
      shifts: [
        shift('2026-08-17', '17:00', '23:00'),
        shift('2026-08-18', '08:00', '19:00'),
        shift('2026-08-19', '17:00', '23:00'),
        shift('2026-08-20', '17:00', '23:00'),
        // Bare 8 timer fri etter torsdagsvakta, under de 9 kontrakten avtaler.
        shift('2026-08-21', '07:00', '13:00'),
        shift('2026-08-22', '10:00', '18:00', { breakMinutes: 30 }),
      ],
      payslips: [
        payslip(AUGUST.start, AUGUST.end, [ordinaryLine(26)], {
          feriepengerBasisOre: 10_000_000,
          feriepengerAccruedOre: 800_000,
        }),
      ],
    });
    const ruleIds = new Set(everything.flags.map((flag) => flag.ruleId));
    // Sju av åtte gir funn her; den åttende (rett til større stilling) krever 12 hele uker.
    expect(ruleIds.has('hours_vs_stillingsprosent')).toBe(true);
    expect(ruleIds.has('overtime')).toBe(true);
    expect(ruleIds.has('rest_periods')).toBe(true);
    expect(ruleIds.has('breaks')).toBe(true);
    expect(ruleIds.has('scheduled_vs_paid')).toBe(true);
    expect(ruleIds.has('supplements')).toBe(true);
    expect(ruleIds.has('feriepenger')).toBe(true);
    expect(everything.blockers).toEqual([]);
  });
});
