/**
 * The Claude client, switched off for the offline edition.
 *
 * Reading a document with the AI would mean shipping an API key inside a file that sits in a
 * phone's Downloads folder, and sending the document to a server — the opposite of what this
 * edition is for. So `hasApiKey()` is false, which the «Les dokument» page already handles:
 * it explains that reading is unavailable and points at entering the data by hand. Schedule
 * import stays fully available, because that parser never needed a key.
 */
import type { Send } from '../../extraction/extract';

export const DEFAULT_MODEL = 'claude-opus-5';

export function hasApiKey(): boolean {
  return false;
}

export function modelName(): string {
  return DEFAULT_MODEL;
}

export function unavailableReason(): string {
  return (
    'Denne utgaven av Lønnssjekk er én enkelt fil som kjører i nettleseren din, uten server ' +
    'og uten nettilgang — så den kan ikke lese dokumenter for deg. Det er med vilje: en ' +
    'API-nøkkel inni fila ville ligget åpen, og dokumentet måtte sendes ut av telefonen. ' +
    'Vaktplaner i CSV, tekst eller PDF leses likevel her på enheten, under «2. Vakter».'
  );
}

export function createClaudeSend(): Send {
  throw new Error(
    'Automatisk dokumentlesing er ikke med i offline-utgaven. Legg inn opplysningene selv — ' +
      'resultatet blir like riktig.',
  );
}
