/**
 * Reading documents in the single-file edition.
 *
 * The real client (`src/extraction/claude.ts`) needs an API key. This file cannot carry one: it
 * would sit in plain sight inside an HTML file in someone's Downloads folder. So that is not
 * how this edition reads a document.
 *
 * Opened from a claude.ai link, the page can ask Claude **on the viewer's own account** through
 * the `sample` capability — no key anywhere, and the viewer is asked before the first call and
 * pays for it themselves. That is wired up here as an ordinary `Send`, the same injected
 * transport the Anthropic client implements, so everything around it is unchanged: the prompt,
 * the schema validation, the one re-ask on invalid JSON, the mapping into the domain model, and
 * — the part that matters most — the masking of fødselsnummer and kontonummer, which happens
 * inside `extractStructured` before any transport sees the text.
 *
 * Opened as a downloaded file there is no viewer and no capability, so reading stays off and
 * `hasApiKey()` is false, which the «Les dokument» page already handles.
 */
import type { Send, SendOptions } from '../../extraction/extract';

export const DEFAULT_MODEL = 'claude-opus-5';

/** What `claude.use('sample')` resolves to, as much of it as this file uses. */
type SampleFn = ((
  input: string,
  options?: { modelTier?: 'default' | 'complex' | 'quick'; cache?: boolean; images?: Blob[] },
) => Promise<{ text: string; truncated: boolean }>) & {
  limits(): Promise<{ maxPromptBytes: number; images?: { maxCount: number } }>;
};

interface ClaudeHost {
  use?(name: string): Promise<unknown>;
}

interface Capabilities {
  sample: SampleFn | null;
  /** Whether this view can be sent an image at all; decided by `sample.limits()`. */
  images: boolean;
  maxPromptBytes: number;
}

let capabilities: Capabilities | null = null;
let pending: Promise<Capabilities> | null = null;

/**
 * Resolve the capabilities once, before any route runs.
 *
 * `hasApiKey()` has to answer synchronously — two route handlers call it — while
 * `claude.use()` is a promise that can take a moment (and up to ten seconds to say "never"
 * when no viewer answers). So `src/offline/api.ts` awaits this before dispatching, and after
 * the first call it is free.
 */
export async function ensureReady(): Promise<void> {
  if (capabilities !== null) return;
  pending ??= resolve();
  capabilities = await pending;
}

async function resolve(): Promise<Capabilities> {
  const absent: Capabilities = { sample: null, images: false, maxPromptBytes: 0 };
  const host = (globalThis as { claude?: ClaudeHost }).claude;
  if (typeof host?.use !== 'function') return absent;

  const sample = (await host.use('sample').catch(() => null)) as SampleFn | null;
  if (sample === null) return absent;

  // Cheap and local: no usage spent and the viewer is not prompted.
  const limits = await sample.limits().catch(() => null);
  return {
    sample,
    images: limits?.images !== undefined,
    maxPromptBytes: limits?.maxPromptBytes ?? 262_144,
  };
}

export function hasApiKey(): boolean {
  return capabilities?.sample !== null && capabilities?.sample !== undefined;
}

export function modelName(): string {
  return DEFAULT_MODEL;
}

/** Whether a photo or screenshot can be sent in this view, as opposed to text only. */
export function canSendImages(): boolean {
  return capabilities?.images === true;
}

export function unavailableReason(): string {
  return (
    'Denne utgaven er én enkelt fil, så den kan ikke ha en API-nøkkel inni seg — da ville den ' +
    'ligget åpen for alle som har fila. Åpner du Lønnssjekk fra en claude.ai-lenke, kan den ' +
    'spørre Claude på din egen konto i stedet, og da virker lesingen. Som nedlastet fil må du ' +
    'legge inn opplysningene selv — resultatet blir like riktig, for det er koden som regner. ' +
    'Vaktplaner i CSV, tekst eller PDF leses uansett her på enheten, under «2. Vakter».'
  );
}

/** The viewer's own words for each way a call can fail. `message` from the runtime is English. */
const SAMPLE_FAILURES: Record<string, string> = {
  not_granted:
    'Du har ikke gitt denne siden lov til å spørre Claude. Du kan tillate det og prøve igjen, ' +
    'eller legge inn opplysningene selv.',
  sampling_disabled: 'Kontoen din har ikke tilgang til Claude herfra.',
  rate_limited: 'Det er for mange forespørsler akkurat nå. Vent litt og prøv igjen.',
  session_expired: 'Du må logge inn på claude.ai igjen.',
  refused: 'Claude ville ikke lese dette dokumentet.',
  empty_completion: 'Vi fikk ikke noe svar å lese. Prøv med færre sider om gangen.',
  prompt_too_large:
    'Dokumentet er for langt å lese i én omgang. Last opp færre sider, eller legg inn ' +
    'opplysningene selv.',
  image_rejected: 'Bildet kunne ikke leses. Prøv et annet bilde, eller en PDF.',
  images_unavailable: 'Denne visningen kan ikke sende bilder. Bruk en PDF, eller skriv inn selv.',
  cancelled: 'Lesingen ble avbrutt.',
};

function base64ToBlob(base64: string, mediaType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mediaType });
}

export function createClaudeSend(): Send {
  const ready = capabilities;
  if (ready?.sample === null || ready?.sample === undefined) {
    throw new Error(unavailableReason());
  }
  const { sample, maxPromptBytes } = ready;

  return async ({ prompt, schemaHint, previousError, image }: SendOptions): Promise<string> => {
    const retryNote =
      previousError === undefined
        ? ''
        : `\n\nForrige svar kunne ikke brukes: ${previousError}\nSvar på nytt, og pass på at JSON-en er gyldig og passer skjemaet.`;

    // There is no system prompt a page can set, so the framing that the real client sends as
    // `system` leads the prompt here instead. Same words, same job.
    const input =
      'Du er et presist uthentingsverktøy for norske arbeidsdokumenter. Du svarer bare med ' +
      'JSON. Du henter ut det som står, og gjetter aldri. Du vurderer aldri om noe er riktig ' +
      `eller ulovlig.\n\n${prompt}\n\nSkjema:\n${schemaHint}${retryNote}`;

    if (new TextEncoder().encode(input).length > maxPromptBytes) {
      throw new Error(SAMPLE_FAILURES.prompt_too_large);
    }

    try {
      // cache: false so a second attempt after a failed validation really asks again.
      const { text } = await sample(input, {
        modelTier: 'default',
        cache: false,
        ...(image === undefined ? {} : { images: [base64ToBlob(image.base64, image.mediaType)] }),
      });
      return text;
    } catch (error) {
      const code = (error as { code?: string }).code ?? 'upstream_error';
      throw new Error(
        SAMPLE_FAILURES[code] ??
          'Vi fikk ikke svar fra Claude. Prøv igjen, eller legg inn opplysningene selv.',
      );
    }
  };
}
