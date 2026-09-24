import { NextResponse } from 'next/server';
import { createClaudeSend, hasApiKey, modelName } from '@/extraction/claude';
import { ExtractionError, extractStructured, type ExtractionImage } from '@/extraction/extract';
import { extractPdfText, isImage, isPdf } from '@/extraction/pdfText';
import { ExtractedContract, ExtractedPayslip, ExtractedSchedule, EXTRACTION_KINDS, type ExtractionKind } from '@/extraction/schemas';
import {
  contractFromExtraction,
  payslipFromExtraction,
  shiftsFromExtraction,
  storedDocumentFrom,
  type Proposal,
} from '@/extraction/toDomain';
import { describeRedactions } from '@/privacy/mask';
import { readWorkspace } from '@/storage/workspaceStore';
import type { DocumentRef } from '@/domain/schemas';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Tells the UI whether document reading is available at all. */
export async function GET() {
  return NextResponse.json({ available: hasApiKey(), model: hasApiKey() ? modelName() : null });
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

export async function POST(request: Request) {
  if (!hasApiKey()) {
    return NextResponse.json(
      {
        error:
          'Det er ingen API-nøkkel satt opp, så vi kan ikke lese dokumenter automatisk. ' +
          'Du kan fortsatt legge inn alt selv — appen fungerer helt uten nøkkel.',
      },
      { status: 503 },
    );
  }

  const form = await request.formData();
  const file = form.get('file');
  const kindValue = String(form.get('kind') ?? '');
  const allowImage = String(form.get('allowImage') ?? '') === 'true';

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Ingen fil ble sendt med.' }, { status: 400 });
  }
  if (!EXTRACTION_KINDS.includes(kindValue as ExtractionKind)) {
    return NextResponse.json({ error: 'Vi vet ikke hva slags dokument dette er.' }, { status: 400 });
  }
  const kind = kindValue as ExtractionKind;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const warnings: string[] = [];
  let text = '';
  let pageCount: number | null = null;
  let image: ExtractionImage | undefined;

  if (isPdf(file.name, file.type)) {
    const pdf = await extractPdfText(bytes);
    text = pdf.text;
    // A scanned PDF has no text layer, and rasterising its pages to send as images is more
    // machinery than it is worth — so this is refused outright rather than half-handled.
    if (pdf.looksScanned) {
      return NextResponse.json(
        {
          error:
            'Denne PDF-en ser ut til å være et skannet bilde uten tekst, så vi finner ingenting å lese ' +
            'i den. Ta gjerne et skjermbilde eller et foto av siden og last opp det i stedet — eller ' +
            'legg inn opplysningene selv.',
        },
        { status: 422 },
      );
    }
    pageCount = pdf.pages.length;
  } else if (isImage(file.type)) {
    if (!allowImage) {
      return NextResponse.json(
        {
          error:
            'Et bilde kan vi ikke maskere. Fødselsnummer og kontonummer som er synlige på bildet blir ' +
            'sendt med til Claude. Kryss av for at du godtar det, eller skriv inn opplysningene selv.',
          needsImageConsent: true,
        },
        { status: 422 },
      );
    }
    const mediaType = IMAGE_TYPES.find((candidate) => candidate === file.type);
    if (mediaType === undefined) {
      return NextResponse.json(
        { error: `Bildeformatet ${file.type} støttes ikke. Bruk JPG, PNG, GIF eller WEBP.` },
        { status: 400 },
      );
    }
    image = { mediaType, base64: Buffer.from(bytes).toString('base64') };
    warnings.push(
      'Dette er et bilde, så vi kunne ikke fjerne fødselsnummer eller kontonummer før det ble sendt.',
    );
  } else {
    // Plain text, CSV and the like: read as text so it can be masked like a PDF.
    text = new TextDecoder().decode(bytes);
  }

  const documentRef: DocumentRef = {
    docId: `doc-${Date.now()}`,
    docName: file.name,
    page: 1,
    kind: kind === 'lonnsslipp' ? 'lonnsslipp' : kind === 'kontrakt' ? 'kontrakt' : 'vaktplan',
  };

  const send = createClaudeSend();
  const workspace = await readWorkspace();

  try {
    if (kind === 'kontrakt') {
      const outcome = await extractStructured({ kind, text, image, schema: ExtractedContract, send });
      const { contract, droppedSupplements } = contractFromExtraction(
        outcome.data,
        workspace.contract,
        workspace.settings.fullTimeHoursPerWeek,
        documentRef,
      );
      if (droppedSupplements > 0) {
        warnings.push(
          `${droppedSupplements} tillegg ble lest uten sats, og er utelatt. Legg dem inn selv hvis de gjelder.`,
        );
      }
      const proposal: Proposal = {
        kind,
        contract,
        notes: outcome.notes,
        warnings,
        redactionSummary: describeRedactions(outcome.redactions),
        documentName: file.name,
        document: storedDocumentFrom({
          ref: documentRef,
          kind: documentRef.kind,
          pageCount,
          maskedTextPreview: outcome.maskedTextPreview,
        }),
      };
      return NextResponse.json(proposal);
    }

    if (kind === 'lonnsslipp') {
      const outcome = await extractStructured({ kind, text, image, schema: ExtractedPayslip, send });
      const proposal: Proposal = {
        kind,
        payslip: payslipFromExtraction(outcome.data, documentRef),
        notes: outcome.notes,
        warnings,
        redactionSummary: describeRedactions(outcome.redactions),
        documentName: file.name,
        document: storedDocumentFrom({
          ref: documentRef,
          kind: documentRef.kind,
          pageCount,
          maskedTextPreview: outcome.maskedTextPreview,
        }),
      };
      return NextResponse.json(proposal);
    }

    const outcome = await extractStructured({ kind, text, image, schema: ExtractedSchedule, send });
    const { shifts, skipped } = shiftsFromExtraction(outcome.data, documentRef);
    if (skipped > 0) warnings.push(`${skipped} rader kunne ikke leses som vakter, og er hoppet over.`);
    const proposal: Proposal = {
      kind,
      shifts,
      notes: outcome.notes,
      warnings,
      redactionSummary: describeRedactions(outcome.redactions),
      documentName: file.name,
      document: storedDocumentFrom({
        ref: documentRef,
        kind: documentRef.kind,
        pageCount,
        maskedTextPreview: outcome.maskedTextPreview,
      }),
    };
    return NextResponse.json(proposal);
  } catch (error) {
    if (error instanceof ExtractionError) {
      return NextResponse.json(
        {
          error:
            `${error.message} Du kan prøve igjen, eller legge inn opplysningene selv — ` +
            'da blir resultatet like riktig.',
        },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: `Klarte ikke lese dokumentet: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
