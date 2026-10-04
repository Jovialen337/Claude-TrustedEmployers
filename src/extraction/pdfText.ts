/**
 * Getting text out of a document.
 *
 * Text is pulled from the PDF itself first: it is exact, it costs nothing, and — crucially —
 * it can be masked before anything is sent anywhere. Vision on a photo or a screenshot is a
 * fallback, and one the user has to agree to, because an image cannot be masked. See
 * DECISIONS.md.
 */

export interface PdfText {
  pages: string[];
  text: string;
  /** True when the PDF turned out to be a scan with no text layer. */
  looksScanned: boolean;
}

/** The part of a pdfjs text item this module needs. */
export interface TextItemLike {
  str: string;
  /** pdfjs transform matrix; [4] is x and [5] is y, in PDF points from the bottom left. */
  transform?: readonly number[];
}

/**
 * How far apart two items' baselines may be and still count as the same line, in PDF points.
 * Superscripts and slight rounding move a baseline by a point or two; a new row moves it by a
 * line height, which is at least ~9pt even in small print.
 */
const SAME_LINE_TOLERANCE = 3;

/**
 * Rebuild the lines of a page from its text items.
 *
 * A PDF stores no lines — only fragments with positions. Joining every fragment with a space
 * turns a schedule of twenty shifts into one long line, which the shift parser then rejects
 * wholesale, so the rows have to be put back together by their baselines: items sharing a
 * baseline are one line, ordered left to right, and the lines run down the page.
 */
export function linesFromItems(items: readonly TextItemLike[]): string[] {
  const rows: { y: number; items: { x: number; str: string }[] }[] = [];

  for (const item of items) {
    if (item.str === '') continue;
    const x = item.transform?.[4] ?? 0;
    const y = item.transform?.[5] ?? 0;
    // Items arrive in reading order often enough that the last row is almost always the match,
    // so search from the end. (No findLast: this has to compile against the project's lib.)
    let row: { y: number; items: { x: number; str: string }[] } | undefined;
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const candidate = rows[index]!;
      if (Math.abs(candidate.y - y) <= SAME_LINE_TOLERANCE) {
        row = candidate;
        break;
      }
    }
    if (row === undefined) {
      rows.push({ y, items: [{ x, str: item.str }] });
    } else {
      row.items.push({ x, str: item.str });
    }
  }

  return rows
    // Larger y is higher up the page, so the top line comes first.
    .sort((a, b) => b.y - a.y)
    .map((row) =>
      row.items
        .sort((a, b) => a.x - b.x)
        .map((entry) => entry.str)
        .join('')
        // Fragments carry their own spacing, so only collapse runs and trim the ends.
        .replace(/[ \t]+/g, ' ')
        .trim(),
    )
    .filter((line) => line !== '');
}

/** Loaded lazily: pdfjs is heavy, and the app must start without it being touched. */
export async function extractPdfText(data: Uint8Array): Promise<PdfText> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data, useSystemFonts: true, disableFontFace: true });
  const document = await task.promise;

  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    // pdfjs mixes text items and marked-content markers in one array; only the former have
    // a string. Mapping rather than narrowing keeps this independent of pdfjs's own types.
    const items: TextItemLike[] = [];
    for (const item of content.items) {
      if ('str' in item) items.push({ str: item.str, transform: item.transform });
    }
    pages.push(linesFromItems(items).join('\n'));
  }
  await task.destroy();

  const text = pages.join('\n\n');
  return { pages, text, looksScanned: text.replace(/\s/g, '').length < 40 };
}

export function isPdf(fileName: string, mimeType: string): boolean {
  return mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
}

export function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}
