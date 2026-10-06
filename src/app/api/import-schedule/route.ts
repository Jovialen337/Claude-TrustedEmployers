/**
 * Uploading a work schedule, parsed locally.
 *
 * This route never calls an API and needs no key: a CSV or text export is decoded and run
 * through the same parser the paste box uses, and a PDF has its text extracted on this
 * machine first. Only if that finds nothing does the answer point at the AI route — so the
 * ordinary case (an export from the shift system) works for everyone, offline.
 */
import { NextResponse } from 'next/server';
import { parseShiftPaste } from '@/domain/importShifts';
import { ShiftKind, type DocumentRef, type Shift, type StoredDocument } from '@/domain/schemas';
import { hasApiKey } from '@/extraction/claude';
import { maskedPreview } from '@/extraction/extract';
import { extractPdfText, isImage, isPdf } from '@/extraction/pdfText';
import { storedDocumentFrom } from '@/extraction/toDomain';
import { maskPersonalData } from '@/privacy/mask';

export const dynamic = 'force-dynamic';

export interface ScheduleImportResult {
  shifts: Shift[];
  errors: { line: number; text: string; reason: string }[];
  documentName: string;
  /** How the text was obtained, so the confirm screen can be honest about it. */
  readAs: 'tekst' | 'pdf';
  aiAvailable: boolean;
  /** Recorded in the workspace when the user confirms, so the file is listed and deletable. */
  document: StoredDocument;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get('file');
  const kindValue = String(form.get('kind') ?? 'jobbet');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Ingen fil ble sendt med.' }, { status: 400 });
  }
  const kind = ShiftKind.safeParse(kindValue);
  if (!kind.success) {
    return NextResponse.json({ error: 'Ugyldig type vakter.' }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (isImage(file.type)) {
    return NextResponse.json(
      {
        error:
          'Et bilde kan vi ikke lese her, bare tekst. Bruk «Les dokument» for bilder og skjermbilder, ' +
          'eller lim inn radene i tekstfeltet.',
      },
      { status: 415 },
    );
  }

  let text: string;
  let readAs: ScheduleImportResult['readAs'];
  let pageCount: number | null = null;

  if (isPdf(file.name, file.type)) {
    const pdf = await extractPdfText(bytes);
    text = pdf.text;
    readAs = 'pdf';
    pageCount = pdf.pages.length;
    if (pdf.looksScanned) {
      return NextResponse.json(
        {
          error:
            'Denne PDF-en ser ut til å være et skannet bilde uten tekst, så vi finner ingen rader i den. ' +
            'Prøv «Les dokument», eller skriv inn vaktene selv.',
        },
        { status: 422 },
      );
    }
  } else {
    text = new TextDecoder().decode(bytes);
    readAs = 'tekst';
  }

  const documentRef: DocumentRef = {
    docId: `vaktplan-${Date.now()}`,
    docName: file.name,
    page: 1,
    kind: 'vaktplan',
  };

  const parsed = parseShiftPaste(text, { kind: kind.data, idPrefix: 'opplastet', documentRef });

  if (parsed.shifts.length === 0) {
    return NextResponse.json(
      {
        error:
          'Vi fant ingen vakter i fila. Hver rad må ha dato, fra og til — for eksempel ' +
          '«2026-08-17;17:00;22:00;30». Er fila satt opp annerledes, kan «Les dokument» tolke den for deg' +
          (hasApiKey() ? '.' : ', men det krever en API-nøkkel.'),
        errors: parsed.errors.slice(0, 10),
      },
      { status: 422 },
    );
  }

  const result: ScheduleImportResult = {
    shifts: parsed.shifts,
    errors: parsed.errors,
    documentName: file.name,
    readAs,
    aiAvailable: hasApiKey(),
    // Nothing was sent anywhere — the file was read here — but the stored preview is masked
    // all the same, since it is shown on screen and kept on disk.
    document: storedDocumentFrom({
      ref: documentRef,
      kind: 'vaktplan',
      pageCount,
      maskedTextPreview: maskedPreview(maskPersonalData(text).text),
    }),
  };
  return NextResponse.json(result);
}
