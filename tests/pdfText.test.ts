/**
 * Reading text back out of a PDF.
 *
 * This was the one untested surface, and it was broken: every text fragment on a page was
 * joined with a space, so a schedule with one shift per row arrived at the parser as a single
 * line and was rejected whole. These tests build real PDFs with pdfkit and read them back, so
 * the thing under test is the actual round trip rather than a fixture that agrees with the bug.
 */
import PDFDocument from 'pdfkit';
import { describe, expect, it } from 'vitest';
import { extractPdfText, isImage, isPdf, linesFromItems } from '@/extraction/pdfText';
import { parseShiftPaste } from '@/domain/importShifts';

async function pdfWith(lines: readonly string[], options: { pages?: string[][] } = {}): Promise<Uint8Array> {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks: Uint8Array[] = [];
  doc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
  const done = new Promise<Uint8Array>((resolve) => {
    doc.on('end', () => {
      const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const out = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
      }
      resolve(out);
    });
  });

  doc.fontSize(11);
  for (const line of lines) doc.text(line);
  for (const page of options.pages ?? []) {
    doc.addPage();
    for (const line of page) doc.text(line);
  }
  doc.end();
  return done;
}

describe('linesFromItems', () => {
  it('groups fragments that share a baseline and orders them left to right', () => {
    const lines = linesFromItems([
      { str: 'til', transform: [1, 0, 0, 1, 120, 700] },
      { str: 'Dato ', transform: [1, 0, 0, 1, 50, 700] },
      { str: 'fra ', transform: [1, 0, 0, 1, 90, 700] },
      { str: '2026-08-03', transform: [1, 0, 0, 1, 50, 680] },
    ]);
    expect(lines).toEqual(['Dato fra til', '2026-08-03']);
  });

  it('reads down the page, since a larger y is higher up', () => {
    const lines = linesFromItems([
      { str: 'bottom', transform: [1, 0, 0, 1, 50, 100] },
      { str: 'top', transform: [1, 0, 0, 1, 50, 700] },
      { str: 'middle', transform: [1, 0, 0, 1, 50, 400] },
    ]);
    expect(lines).toEqual(['top', 'middle', 'bottom']);
  });

  it('keeps a baseline nudged by a point or two on the same line', () => {
    expect(
      linesFromItems([
        { str: 'kr 100', transform: [1, 0, 0, 1, 50, 500] },
        { str: ',-', transform: [1, 0, 0, 1, 90, 502] },
      ]),
    ).toEqual(['kr 100,-']);
  });

  it('separates rows a line height apart', () => {
    expect(
      linesFromItems([
        { str: 'row one', transform: [1, 0, 0, 1, 50, 500] },
        { str: 'row two', transform: [1, 0, 0, 1, 50, 488] },
      ]),
    ).toEqual(['row one', 'row two']);
  });

  it('drops empty fragments and tolerates items with no transform', () => {
    expect(linesFromItems([{ str: '' }, { str: 'text' }, { str: '   ' }])).toEqual(['text']);
  });
});

describe('extractPdfText', () => {
  it('gives back one line per line of the PDF', async () => {
    const rows = [
      'Vaktplan august 2026 - Eksempel AS',
      '2026-08-17;17:00;22:00;30',
      '2026-08-18;16:30;22:30;30',
      '2026-08-19;18:00;23:30;0',
    ];
    const result = await extractPdfText(await pdfWith(rows));

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]!.split('\n')).toEqual(rows);
    expect(result.looksScanned).toBe(false);
  });

  it('is good enough for the shift parser to read every row', async () => {
    const bytes = await pdfWith([
      'Vaktplan august 2026',
      '2026-08-17;17:00;22:00;30',
      '2026-08-18;16:30;22:30;30',
      '2026-08-19;18:00;23:30;0',
      '2026-08-21;11:00;19:00;30',
    ]);
    const { text } = await extractPdfText(bytes);
    const parsed = parseShiftPaste(text, { kind: 'jobbet', idPrefix: 'pdf' });

    // Four shift rows read; only the heading is left over.
    expect(parsed.shifts).toHaveLength(4);
    expect(parsed.shifts.map((shift) => shift.date)).toEqual([
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-21',
    ]);
    expect(parsed.shifts[0]!.breakMinutes).toBe(30);
    expect(parsed.errors).toHaveLength(1);
  });

  it('separates pages with a blank line', async () => {
    const result = await extractPdfText(
      await pdfWith(['page one line'], { pages: [['page two line']] }),
    );
    expect(result.pages).toEqual(['page one line', 'page two line']);
    expect(result.text).toBe('page one line\n\npage two line');
  });

  it('reports a PDF with no text layer as a probable scan', async () => {
    const result = await extractPdfText(await pdfWith(['kort']));
    expect(result.looksScanned).toBe(true);
  });
});

describe('isPdf / isImage', () => {
  it('recognises a PDF by mime type or by extension', () => {
    expect(isPdf('x.bin', 'application/pdf')).toBe(true);
    expect(isPdf('Vaktplan.PDF', '')).toBe(true);
    expect(isPdf('vakter.csv', 'text/csv')).toBe(false);
  });

  it('recognises any image', () => {
    expect(isImage('image/jpeg')).toBe(true);
    expect(isImage('application/pdf')).toBe(false);
  });
});
