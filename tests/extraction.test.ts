/**
 * Extraction tests.
 *
 * No API key and no network here: the transport is injected, so the parts that matter —
 * masking before sending, rejecting output that does not validate, re-asking once, and the
 * mapping into the domain model — are all tested directly.
 */
import { describe, expect, it, vi } from 'vitest';
import { formatKr } from '@/domain/money';
import { ExtractionError, extractJsonObject, extractStructured, type Send } from '@/extraction/extract';
import { ExtractedContract, ExtractedPayslip, ExtractedSchedule } from '@/extraction/schemas';
import { contractFromExtraction, payslipFromExtraction, shiftsFromExtraction } from '@/extraction/toDomain';
import { buildPrompt } from '@/extraction/prompts';
import { contract as contractFixture } from './fixtures';

const CONTRACT_TEXT = [
  'ARBEIDSAVTALE',
  'Arbeidsgiver: Kafé Nordlys AS',
  'Arbeidstaker: Kari Nordmann, fødselsnummer 01019012345',
  'Konto for lønn: 1234.56.78901',
  'Stilling: 60 %, timelønn kr 198,50',
].join('\n');

const VALID_CONTRACT_JSON = JSON.stringify({
  employer: 'Kafé Nordlys AS',
  employeeName: 'Kari Nordmann',
  startDate: '2025-09-01',
  stillingsprosent: 60,
  fullTimeHoursPerWeek: 37.5,
  contractedHoursPerWeek: null,
  wageKind: 'hourly',
  wageKroner: 198.5,
  tariffavtale: null,
  supplements: [
    { label: 'Kveldstillegg', kind: 'kveld', fromTime: '18:00', toTime: '00:00', rateKroner: 25, ratePercent: null, source: 'Pkt. 6' },
    { label: 'Uten sats', kind: 'helg', fromTime: null, toTime: null, rateKroner: null, ratePercent: null, source: null },
  ],
  notes: ['Pausen er ikke beskrevet i avtalen.'],
});

describe('før noe sendes', () => {
  it('maskerer fødselsnummer og kontonummer i teksten som sendes', async () => {
    const send = vi.fn<Send>(async () => VALID_CONTRACT_JSON);
    const outcome = await extractStructured({
      kind: 'kontrakt',
      text: CONTRACT_TEXT,
      schema: ExtractedContract,
      send,
    });

    const sentPrompt = send.mock.calls[0]![0]!.prompt;
    expect(sentPrompt).not.toContain('01019012345');
    expect(sentPrompt).not.toContain('1234.56.78901');
    expect(sentPrompt).toContain('[fjernet fødselsnummer]');
    expect(sentPrompt).toContain('[fjernet kontonummer]');
    // Det vi trenger står fortsatt igjen.
    expect(sentPrompt).toContain('Kafé Nordlys AS');
    expect(sentPrompt).toContain('198,50');
    expect(outcome.redactions.map((entry) => entry.kind).sort()).toEqual(['fodselsnummer', 'kontonummer']);
  });

  it('ber modellen om å ikke gjette og ikke vurdere', () => {
    const prompt = buildPrompt('kontrakt', 'noe tekst');
    expect(prompt).toContain('Er du usikker, sett feltet til null');
    expect(prompt).toContain('Ikke regn ut noe');
    expect(prompt).toContain('Ikke vurder om noe er riktig eller galt');
  });
});

describe('svar som ikke kan brukes', () => {
  it('finner JSON inne i prat og kodeblokker', () => {
    expect(extractJsonObject('Her er dataene:\n```json\n{"a":1}\n```\nHåper det hjelper!')).toBe('{"a":1}');
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
    expect(extractJsonObject('ingen json her')).toBeNull();
  });

  it('spør på nytt med feilen når svaret ikke passer skjemaet', async () => {
    const send = vi
      .fn<Send>()
      .mockResolvedValueOnce('{"employer": 123}')
      .mockResolvedValueOnce(VALID_CONTRACT_JSON);

    const outcome = await extractStructured({
      kind: 'kontrakt',
      text: CONTRACT_TEXT,
      schema: ExtractedContract,
      send,
    });

    expect(outcome.attempts).toBe(2);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]![0]!.previousError).toContain('employer');
    expect(outcome.data.employer).toBe('Kafé Nordlys AS');
  });

  it('gir opp med en tydelig feil i stedet for å bruke noe halvveis', async () => {
    const send = vi.fn<Send>(async () => 'beklager, jeg klarer det ikke');
    await expect(
      extractStructured({ kind: 'kontrakt', text: CONTRACT_TEXT, schema: ExtractedContract, send }),
    ).rejects.toThrow(ExtractionError);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('sender bildet videre når dokumentet er et foto', async () => {
    const send = vi.fn<Send>(async () => VALID_CONTRACT_JSON);
    await extractStructured({
      kind: 'kontrakt',
      text: '',
      schema: ExtractedContract,
      send,
      image: { mediaType: 'image/png', base64: 'AAAA' },
    });
    expect(send.mock.calls[0]![0]!.image).toEqual({ mediaType: 'image/png', base64: 'AAAA' });
    expect(send.mock.calls[0]![0]!.prompt).toContain('lagt ved som bilde');
  });
});

describe('fra uthentede felt til datamodellen', () => {
  it('gjør kroner om til øre og lager gyldige kontrakter', async () => {
    const send: Send = async () => VALID_CONTRACT_JSON;
    const outcome = await extractStructured({ kind: 'kontrakt', text: CONTRACT_TEXT, schema: ExtractedContract, send });
    const { contract, droppedSupplements } = contractFromExtraction(outcome.data, null, 37.5, null);

    expect(contract.wage).toEqual({ kind: 'hourly', amountOre: 19850 });
    expect(formatKr(contract.wage.amountOre)).toBe('198,50 kr');
    expect(contract.stillingsprosent).toBe(60);
    // Tillegget uten sats slippes, i stedet for å bli lagret som 0 kr.
    expect(contract.supplements).toHaveLength(1);
    expect(droppedSupplements).toBe(1);
    expect(contract.supplements[0]!.rate).toEqual({ kind: 'per_hour_ore', value: 2500 });
    expect(outcome.notes).toEqual(['Pausen er ikke beskrevet i avtalen.']);
  });

  it('beholder det brukeren alt har når et felt mangler', () => {
    const existing = contractFixture({ employer: 'Gammel arbeidsgiver AS', stillingsprosent: 40 });
    const { contract } = contractFromExtraction(
      ExtractedContract.parse({
        employer: null,
        employeeName: null,
        startDate: null,
        stillingsprosent: null,
        fullTimeHoursPerWeek: null,
        contractedHoursPerWeek: null,
        wageKind: null,
        wageKroner: null,
        tariffavtale: null,
        supplements: [],
        notes: [],
      }),
      existing,
      37.5,
      null,
    );
    expect(contract.employer).toBe('Gammel arbeidsgiver AS');
    expect(contract.stillingsprosent).toBe(40);
    expect(contract.wage.amountOre).toBe(existing.wage.amountOre);
  });

  it('tar med avtalte vilkår som avviker fra loven', async () => {
    const send: Send = async () =>
      JSON.stringify({
        employer: 'Kafé Nordlys AS',
        employeeName: null,
        startDate: null,
        stillingsprosent: 60,
        fullTimeHoursPerWeek: 37.5,
        contractedHoursPerWeek: null,
        wageKind: 'hourly',
        wageKroner: 198.5,
        tariffavtale: 'Eksempeltariff',
        averagingAgreement: true,
        overtimeSupplementPercent: 50,
        agreedDailyRestHours: 9,
        minBreakMinutesLongDay: 45,
        paidBreak: true,
        feriepengerRatePercent: 12,
        supplements: [],
        notes: [],
      });
    const outcome = await extractStructured({ kind: 'kontrakt', text: 'noe', schema: ExtractedContract, send });
    const { contract } = contractFromExtraction(outcome.data, null, 37.5, null);
    expect(contract.overtimeSupplementPercent).toBe(50);
    expect(contract.agreedDailyRestHours).toBe(9);
    expect(contract.minBreakMinutesLongDay).toBe(45);
    expect(contract.paidBreak).toBe(true);
    expect(contract.feriepengerRatePercent).toBe(12);
    expect(contract.averagingAgreement).toBe(true);
  });

  it('tar med opplysningene arbeidsavtalen skal ha, men gjetter aldri på § 10-12-unntaket', async () => {
    const send: Send = async () =>
      JSON.stringify({
        employer: 'Kafé Nordlys AS',
        employeeName: 'Kari Nordmann',
        startDate: '2025-09-01',
        stillingsprosent: 60,
        fullTimeHoursPerWeek: 37.5,
        contractedHoursPerWeek: null,
        wageKind: 'hourly',
        wageKroner: 198.5,
        tariffavtale: null,
        jobTitle: 'Servitør',
        workplace: 'Storgata 1',
        employmentType: 'midlertidig',
        temporaryBasis: 'Vikar for navngitt ansatt',
        noticePeriodMonths: 1,
        probationMonths: 6,
        payDayOfMonth: 15,
        supplements: [],
        notes: [],
      });
    const outcome = await extractStructured({ kind: 'kontrakt', text: 'noe', schema: ExtractedContract, send });
    const { contract } = contractFromExtraction(outcome.data, null, 37.5, null);
    expect(contract.jobTitle).toBe('Servitør');
    expect(contract.workplace).toBe('Storgata 1');
    expect(contract.employmentType).toBe('midlertidig');
    expect(contract.temporaryBasis).toBe('Vikar for navngitt ansatt');
    expect(contract.noticePeriodMonths).toBe(1);
    expect(contract.probationMonths).toBe(6);
    expect(contract.payDayOfMonth).toBe(15);
    // Unntaket fra arbeidstidsreglene slår av fem regler, så det skal brukeren svare på selv.
    expect(contract.workingTimeExemption).toBe('ingen');
  });

  it('avviser en utbetalingsdag som ikke finnes i en måned', async () => {
    const send: Send = async () =>
      JSON.stringify({
        employer: null, employeeName: null, startDate: null, stillingsprosent: null,
        fullTimeHoursPerWeek: null, contractedHoursPerWeek: null, wageKind: null, wageKroner: null,
        tariffavtale: null, payDayOfMonth: 45, supplements: [], notes: [],
      });
    const outcome = await extractStructured({ kind: 'kontrakt', text: 'noe', schema: ExtractedContract, send });
    const { contract } = contractFromExtraction(outcome.data, null, 37.5, null);
    expect(contract.payDayOfMonth).toBeNull();
  });

  it('lar avtalte vilkår stå åpne når dokumentet ikke nevner dem', async () => {
    // Et dokument som ikke sier noe om overtid skal ikke koste et nytt forsøk, og skal ikke
    // få lovens verdi stemplet inn som om den sto i kontrakten.
    const send: Send = async () => VALID_CONTRACT_JSON;
    const outcome = await extractStructured({ kind: 'kontrakt', text: 'noe', schema: ExtractedContract, send });
    expect(outcome.attempts).toBe(1);
    expect(outcome.data.overtimeSupplementPercent).toBeNull();
    const { contract } = contractFromExtraction(outcome.data, null, 37.5, null);
    expect(contract.overtimeSupplementPercent).toBeNull();
    expect(contract.feriepengerRatePercent).toBeNull();
    expect(contract.paidBreak).toBe(false);
  });

  it('gjør lønnsslippen om til øre', () => {
    const payslip = payslipFromExtraction(
      ExtractedPayslip.parse({
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
        lines: [
          { label: 'Timelønn', category: 'ordinaer', hours: 92, rateKroner: 198.5, amountKroner: 18262 },
          { label: 'Kveldstillegg', category: 'kveldstillegg', hours: 50, rateKroner: 25, amountKroner: 1250 },
        ],
        grossKroner: 19512,
        feriepengerBasisKroner: 65000,
        feriepengerAccruedKroner: 6000,
        notes: [],
      }),
      null,
    );
    expect(payslip.lines[0]!.amountOre).toBe(1_826_200);
    expect(payslip.lines[0]!.rateOre).toBe(19850);
    expect(payslip.feriepengerBasisOre).toBe(6_500_000);
    expect(payslip.grossOre).toBe(1_951_200);
  });

  it('hopper over vakter som ikke er gyldige, og teller dem', () => {
    const { shifts, skipped } = shiftsFromExtraction(
      ExtractedSchedule.parse({
        shifts: [
          { date: '2026-08-17', start: '17:00', end: '22:00', breakMinutes: 0 },
          { date: '17. august', start: '17:00', end: '22:00', breakMinutes: null },
          { date: '2026-08-20', start: '22:00', end: '06:00', breakMinutes: 30 },
        ],
        kind: 'jobbet',
        notes: [],
      }),
      null,
    );
    expect(shifts).toHaveLength(2);
    expect(skipped).toBe(1);
    expect(shifts.every((shift) => shift.source === 'ai')).toBe(true);
    expect(shifts[1]).toMatchObject({ start: '22:00', end: '06:00', breakMinutes: 30 });
  });
});
