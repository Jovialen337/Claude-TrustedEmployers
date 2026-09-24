/**
 * The extraction boundary.
 *
 * Everything here is written so the risky part — a model returning something unexpected —
 * cannot reach the rules. The response is parsed against a schema; if it does not validate,
 * the model is asked again with the validation error, and after that the attempt fails
 * loudly. Nothing is guessed on the model's behalf.
 *
 * The transport is injected, so the retry logic and the mapping into the domain model are
 * unit tested without a network or an API key.
 */
import type { z } from 'zod';
import { maskPersonalData, type Redaction } from '../privacy/mask';
import { buildPrompt, schemaHint } from './prompts';
import type { ExtractionKind } from './schemas';

export interface ExtractionImage {
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  base64: string;
}

export interface SendOptions {
  prompt: string;
  /** JSON shape the model is asked to produce. */
  schemaHint: string;
  /** Present only when the previous answer failed validation. */
  previousError?: string;
  /**
   * A photo or screenshot, when the document has no text layer. An image cannot be masked,
   * so this path requires the user's explicit consent — see DECISIONS.md.
   */
  image?: ExtractionImage;
}

/** A minimal transport: text in, text out. Implemented by claude.ts, faked in tests. */
export type Send = (options: SendOptions) => Promise<string>;

export interface ExtractionOutcome<T> {
  data: T;
  redactions: Redaction[];
  notes: string[];
  attempts: number;
  /** The start of the masked text that was sent, so the user can see what left the machine. */
  maskedTextPreview: string;
}

export class ExtractionError extends Error {
  constructor(
    message: string,
    readonly attempts: number,
    readonly lastResponse: string | null,
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

/** Models sometimes wrap JSON in prose or a code fence. Take the outermost JSON object. */
export function extractJsonObject(response: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(response);
  const candidate = (fenced?.[1] ?? response).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

export const MASKED_PREVIEW_LENGTH = 800;

export function maskedPreview(text: string): string {
  const trimmed = text.trim();
  return trimmed.length <= MASKED_PREVIEW_LENGTH
    ? trimmed
    : `${trimmed.slice(0, MASKED_PREVIEW_LENGTH)} …`;
}

export async function extractStructured<T>(options: {
  kind: ExtractionKind;
  text: string;
  schema: z.ZodType<T>;
  send: Send;
  maxAttempts?: number;
  image?: ExtractionImage;
}): Promise<ExtractionOutcome<T>> {
  const maxAttempts = options.maxAttempts ?? 2;
  const masked = maskPersonalData(options.text);
  const prompt = buildPrompt(
    options.kind,
    options.image !== undefined && masked.text.trim() === ''
      ? '(Dokumentet er lagt ved som bilde. Les det derfra.)'
      : masked.text,
  );
  const hint = schemaHint(options.kind);

  let previousError: string | undefined;
  let lastResponse: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    lastResponse = await options.send({ prompt, schemaHint: hint, previousError, image: options.image });

    const json = extractJsonObject(lastResponse);
    if (json === null) {
      previousError = 'Svaret inneholdt ikke JSON.';
      continue;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(json);
    } catch (error) {
      previousError = `Ugyldig JSON: ${(error as Error).message}`;
      continue;
    }

    const result = options.schema.safeParse(parsedJson);
    if (!result.success) {
      previousError = result.error.issues
        .slice(0, 8)
        .map((issue) => `${issue.path.join('.') || '(rot)'}: ${issue.message}`)
        .join('; ');
      continue;
    }

    const notes = (parsedJson as { notes?: unknown }).notes;
    return {
      data: result.data,
      redactions: masked.redactions,
      notes: Array.isArray(notes) ? notes.filter((note): note is string => typeof note === 'string') : [],
      attempts: attempt,
      maskedTextPreview: maskedPreview(masked.text),
    };
  }

  throw new ExtractionError(
    `Klarte ikke lese dokumentet etter ${maxAttempts} forsøk. Siste feil: ${previousError ?? 'ukjent'}`,
    maxAttempts,
    lastResponse,
  );
}
