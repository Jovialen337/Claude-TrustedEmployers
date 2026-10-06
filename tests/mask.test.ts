import { describe, expect, it } from 'vitest';
import { containsPersonalData, describeRedactions, maskPersonalData } from '@/privacy/mask';

describe('maskering av personopplysninger', () => {
  it('fjerner fødselsnummer, med og uten mellomrom', () => {
    expect(maskPersonalData('Fødselsnummer: 01019012345').text).toBe('Fødselsnummer: [fjernet fødselsnummer]');
    expect(maskPersonalData('Fnr 010190 12345 står her').text).toBe('Fnr [fjernet fødselsnummer] står her');
    expect(maskPersonalData('D-nummer 41019012345').text).toContain('[fjernet fødselsnummer]');
  });

  it('fjerner kontonummer', () => {
    expect(maskPersonalData('Konto: 1234.56.78901').text).toBe('Konto: [fjernet kontonummer]');
    expect(maskPersonalData('Konto 1234 56 78901').text).toBe('Konto [fjernet kontonummer]');
    expect(maskPersonalData('IBAN NO93 8601 1117 947').text).toBe('IBAN [fjernet kontonummer]');
  });

  it('fjerner kortnummer', () => {
    expect(maskPersonalData('Kort 4111 1111 1111 1111').text).toBe('Kort [fjernet kortnummer]');
  });

  it('lar alt vi trenger for sjekken stå igjen', () => {
    const payslip = [
      'Lønnsslipp juli 2026',
      'Periode 2026-07-01 - 2026-07-31',
      'Timelønn 92,00 t x 198,50 = 18 262,00',
      'Kveldstillegg 50,00 t x 25,00 = 1 250,00',
      'Vakt 17.07.2026 17:00-22:00 pause 30 min',
      'Feriepengegrunnlag 65 000,00',
      'Brutto 20 524,50',
      'Stillingsprosent 60 %',
    ].join('\n');
    const { text, redactions } = maskPersonalData(payslip);
    expect(text).toBe(payslip);
    expect(redactions).toEqual([]);
  });

  it('teller det som ble fjernet, og kan forklare det på norsk', () => {
    const { redactions } = maskPersonalData('01019012345 og 02029012345 og konto 1234.56.78901');
    const fnr = redactions.find((entry) => entry.kind === 'fodselsnummer')!;
    expect(fnr.count).toBe(2);
    expect(describeRedactions(redactions)).toContain('2 fødselsnummer');
    expect(describeRedactions(redactions)).toContain('kontonummer');
    expect(describeRedactions([])).toContain('ingen');
  });

  it('kjenner igjen at teksten fortsatt inneholder noe personlig', () => {
    expect(containsPersonalData('Fnr 01019012345')).toBe(true);
    expect(containsPersonalData(maskPersonalData('Fnr 01019012345').text)).toBe(false);
    expect(containsPersonalData('Timelønn 198,50 kr')).toBe(false);
  });

  it('etterlater ingenting når dokumentet er fullt av numre', () => {
    const messy = 'Kari Nordmann, 01019012345, konto 1234.56.78901, kort 4111111111111111';
    const { text } = maskPersonalData(messy);
    expect(text).toBe(
      'Kari Nordmann, [fjernet fødselsnummer], konto [fjernet kontonummer], kort [fjernet kortnummer]',
    );
    expect(containsPersonalData(text)).toBe(false);
  });
});
