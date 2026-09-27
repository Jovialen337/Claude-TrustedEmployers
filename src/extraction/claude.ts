/**
 * The Claude transport. The only place in the app that talks to the network.
 *
 * If there is no API key, this module is never reached: the UI keeps working with manual
 * entry and the demo data, and the extraction route answers with a clear message instead.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { Send, SendOptions } from './extract';

export const DEFAULT_MODEL = 'claude-opus-5';

export function hasApiKey(): boolean {
  return (process.env.ANTHROPIC_API_KEY ?? '').trim().length > 0;
}

export function modelName(): string {
  return (process.env.ANTHROPIC_MODEL ?? '').trim() || DEFAULT_MODEL;
}

export function createClaudeSend(): Send {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  return async ({ prompt, schemaHint, previousError, image }: SendOptions): Promise<string> => {
    const retryNote =
      previousError === undefined
        ? ''
        : `\n\nForrige svar kunne ikke brukes: ${previousError}\nSvar på nytt, og pass på at JSON-en er gyldig og passer skjemaet.`;

    const response = await client.messages.create({
      model: modelName(),
      max_tokens: 8000,
      // Deterministic reading: the same document should give the same fields.
      temperature: 0,
      system:
        'Du er et presist uthentingsverktøy for norske arbeidsdokumenter. Du svarer bare med JSON. ' +
        'Du henter ut det som står, og gjetter aldri. Du vurderer aldri om noe er riktig eller ulovlig.',
      messages: [
        {
          role: 'user',
          content: [
            ...(image === undefined
              ? []
              : [
                  {
                    type: 'image' as const,
                    source: { type: 'base64' as const, media_type: image.mediaType, data: image.base64 },
                  },
                ]),
            { type: 'text' as const, text: `${prompt}\n\nSkjema:\n${schemaHint}${retryNote}` },
          ],
        },
      ],
    });

    return response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();
  };
}
