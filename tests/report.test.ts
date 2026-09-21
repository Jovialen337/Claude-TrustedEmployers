import { describe, expect, it } from 'vitest';
import { runCheck } from '@/domain/engine';
import { demoWorkspace } from '@/demo/workspace';
import { draftMessage } from '@/report/draftMessage';
import { buildReportPdf, toWinAnsi } from '@/report/pdf';
import { emptyWorkspace } from '@/domain/schemas';

const workspace = demoWorkspace();
const result = runCheck(workspace, { now: '2026-09-21T12:00:00.000Z' });

describe('utkast til melding', () => {
  const message = draftMessage(result, workspace.contract);

  it('er på norsk, høflig og faktisk', () => {
    expect(message.startsWith('Hei,')).toBe(true);
    expect(message).toContain('Med vennlig hilsen');
    expect(message).toContain('Kari Nordmann');
    expect(message).toContain('jeg håper du kan se på dem');
  });

  it('tar med hvert sannsynlige feil med regnestykke og paragraf', () => {
    expect(message).toContain('Helligdagstillegg mangler');
    expect(message).toContain('10,0 t × 198,50 kr × 100 % = 1 985,00 kr − 0,00 kr betalt = 1 985,00 kr');
    expect(message).toContain('2,0 t × 198,50 kr × 40 % = 158,80 kr');
    expect(message).toContain('Grunnlag: Arbeidsmiljøloven § 10-4');
    // Et kontraktspunkt skal ikke leses som en paragraf.
    expect(message).toContain('Grunnlag: Arbeidsavtalen eller tariffavtalen, Avtalte tillegg');
    expect(message).toContain('6 307,35 kr');
  });

  it('skiller spørsmål fra krav', () => {
    expect(message).toContain('I tillegg er det noe jeg gjerne vil forstå bedre');
    expect(message).toContain('Sjekk feriepengene');
  });

  it('spør om flere vakter når timene er under stillingsprosenten', () => {
    expect(message).toContain('7,5 t mindre enn stillingsprosenten');
    expect(message).toContain('60 %');
  });

  it('holder seg åpen for at brukeren kan ha misforstått', () => {
    expect(message).toContain('Jeg kan ha misforstått noe');
  });

  it('bruker en plassholder når navnet mangler', () => {
    const anonymous = draftMessage(result, { ...workspace.contract!, employeeName: '  ' });
    expect(anonymous).toContain('[navnet ditt]');
  });
});

describe('PDF-rapporten', () => {
  it('lages fra demodataene', async () => {
    const pdf = await buildReportPdf(result, workspace, { generatedLabel: '2026-09-21' });
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5000);
    // Flere sider: forside/sammendrag, funn, tidslinje, utkast og kilder.
    const text = pdf.toString('latin1');
    expect(text).toContain('/Type /Page');
  });

  it('lages også når det ikke er noe å rapportere', async () => {
    const empty = emptyWorkspace('2026-09-21T00:00:00.000Z');
    const pdf = await buildReportPdf(runCheck(empty, { now: '2026-09-21T12:00:00.000Z' }), empty);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('bytter ut tegn de innebygde fontene ikke kan vise', () => {
    // Minustegnet U+2212 finnes ikke i WinAnsi og må bli en vanlig bindestrek.
    expect(toWinAnsi('198,50 kr \u2212 185,00 kr')).toBe('198,50 kr - 185,00 kr');
    // Disse skal beholdes: paragraftegn, ganger, tankestrek, anførselstegn og æøå.
    expect(toWinAnsi('§ 10-6 × 40 % \u2013 «sånn» æøåÆØÅ')).toBe('§ 10-6 × 40 % \u2013 «sånn» æøåÆØÅ');
    expect(toWinAnsi('emoji \u{1f600}')).toBe('emoji ??');
  });
});
