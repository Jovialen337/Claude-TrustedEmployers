import { describe, expect, it } from 'vitest';
import { AGREED_TERM_KEYS, describeInvalidTerms, parseAgreedTerms, type AgreedTermInput } from '@/domain/agreedTerms';

function input(): AgreedTermInput {
  return Object.fromEntries(AGREED_TERM_KEYS.map((key) => [key, ''])) as AgreedTermInput;
}

describe('avtalte vilkår fra skjemaet', () => {
  it('tolker alle tomme felt som «kontrakten sier ingenting»', () => {
    const { values, invalid } = parseAgreedTerms(input());
    expect(invalid).toEqual([]);
    for (const key of AGREED_TERM_KEYS) expect(values[key], key).toBeNull();
  });

  it('leser tall med komma', () => {
    const { values, invalid } = parseAgreedTerms({
      ...input(),
      overtimeSupplementPercent: '50',
      agreedDailyRestHours: '9,5',
      minBreakMinutesLongDay: '45',
      feriepengerRatePercent: '12',
    });
    expect(invalid).toEqual([]);
    expect(values.overtimeSupplementPercent).toBe(50);
    expect(values.agreedDailyRestHours).toBe(9.5);
    expect(values.minBreakMinutesLongDay).toBe(45);
    expect(values.feriepengerRatePercent).toBe(12);
    expect(values.normalDailyLimitHours).toBeNull();
  });

  it('sier hvilket felt som ikke er et tall, på norsk', () => {
    const { invalid } = parseAgreedTerms({
      ...input(),
      overtimeSupplementPercent: 'femti prosent',
      agreedDailyRestHours: '-3',
    });
    expect(invalid).toEqual(['overtimeSupplementPercent', 'agreedDailyRestHours']);
    const message = describeInvalidTerms(invalid);
    expect(message).toContain('overtidstillegg');
    expect(message).toContain('arbeidsfri per døgn');
    expect(message).toContain('la feltet stå tomt');
  });

  it('blander ikke feltnavnene i skjemaet med feltnavnene i kontrakten', () => {
    // Feriepengesatsen heter «feriepenger» i skjemaet og «feriepengerRatePercent» i
    // kontrakten. Da denne koden slo dem sammen, ble hvert tomme felt meldt som en feil.
    const { values, invalid } = parseAgreedTerms({ ...input(), feriepengerRatePercent: '10,2' });
    expect(invalid).toEqual([]);
    expect(values.feriepengerRatePercent).toBe(10.2);
  });
});
