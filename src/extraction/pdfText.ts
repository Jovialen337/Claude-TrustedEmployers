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

/** Loaded lazily: pdfjs is heavy, and the app must start without it being touched. */
export async function extractPdfText(data: Uint8Array): Promise<PdfText> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data, useSystemFonts: true, disableFontFace: true });
  const document = await task.promise;

  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/[ \t]+/g, ' ')
      .trim();
    pages.push(text);
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
