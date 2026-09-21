import { describe, expect, it } from 'vitest';
import {
  formatHours,
  parseKrInput,
  formatHoursNumber,
  formatKr,
  formatPercent,
  formatOre,
  hoursTimesRate,
  mulOre,
  oreFromKr,
  roundHours,
  sumOre,
} from '@/domain/money';

describe('øre-aritmetikk', () => {
  it('konverterer kroner til hele øre', () => {
    expect(oreFromKr(198.5)).toBe(19850);
    expect(oreFromKr(0.1)).toBe(10);
    // 1.005 * 100 is 100.49999999999999 in floating point; the guard in oreFromKr
    // must stop that from becoming 100 øre.
    expect(oreFromKr(1.005)).toBe(101);
    expect(oreFromKr(0.145)).toBe(15);
  });

  it('leser beløp slik en norsk bruker skriver dem', () => {
    expect(parseKrInput('198,50')).toBe(19850);
    expect(parseKrInput('1 234,5')).toBe(123450);
    expect(parseKrInput('20')).toBe(2000);
    expect(parseKrInput('-20,25')).toBe(-2025);
    expect(parseKrInput('0,05')).toBe(5);
    expect(parseKrInput('')).toBeNull();
    expect(parseKrInput('kr 20')).toBeNull();
  });

  it('multipliserer uten flyttallsfeil', () => {
    expect(mulOre(19850, 0.4)).toBe(7940);
    expect(mulOre(1, 0.5)).toBe(1); // rounds half up
  });

  it('regner timer × sats', () => {
    // The worked example from the spec: 2,5 t × 198,50 kr = 496,25 kr
    expect(hoursTimesRate(2.5, 19850)).toBe(49625);
    expect(formatKr(hoursTimesRate(2.5, 19850))).toBe('496,25 kr');
  });

  it('summerer', () => {
    expect(sumOre([100, 250, 3])).toBe(353);
    expect(sumOre([])).toBe(0);
  });
});

describe('formatering', () => {
  it('formaterer øre på norsk', () => {
    expect(formatOre(49625)).toBe('496,25');
    expect(formatOre(0)).toBe('0,00');
    expect(formatOre(5)).toBe('0,05');
    expect(formatOre(123456789)).toBe('1 234 567,89');
    expect(formatKr(-49625)).toBe('−496,25 kr');
  });

  it('formaterer timer med komma', () => {
    expect(formatHoursNumber(16)).toBe('16,0');
    expect(formatHoursNumber(18.5)).toBe('18,5');
    expect(formatHoursNumber(2.25)).toBe('2,25');
    expect(formatHours(37.5)).toBe('37,5 t');
    expect(roundHours(7.499999)).toBe(7.5);
  });
});

describe('prosent', () => {
  it('dropper bare en etterfølgende tidel', () => {
    expect(formatPercent(40)).toBe('40 %');
    expect(formatPercent(82.5)).toBe('82,5 %');
    expect(formatPercent(10.2)).toBe('10,2 %');
    // ',0' inne i tallet skal ikke fjernes: 20,08 % må ikke bli 208 %.
    expect(formatPercent(20.08)).toBe('20,08 %');
  });
});
