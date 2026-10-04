/**
 * Storage for the offline single-file edition: the browser's own localStorage, on this device.
 *
 * This is a drop-in twin of `src/storage/workspaceStore.ts` — same exported functions, same
 * signatures — so the API route handlers and the pages are reused verbatim and the two builds
 * cannot drift apart. The build maps `@/storage/workspaceStore` here (see
 * `scripts/build-offline.mjs`).
 *
 * The file store writes atomically because a crash could otherwise leave half a JSON file.
 * localStorage has no such failure mode: `setItem` either takes the whole string or throws.
 * What it does have is a quota, so a write that does not fit must say so in plain Norwegian
 * rather than fail silently and lose the user's data.
 */
import { Workspace, emptyWorkspace } from '../domain/schemas';

export const STORAGE_KEY = 'lonnssjekk:workspace';

/** Thrown with a message meant to be read by the user, not a developer. */
export class StorageError extends Error {}

function store(): Storage {
  // Private browsing and blocked site data both make this throw rather than return null.
  try {
    const candidate = globalThis.localStorage;
    if (candidate === undefined || candidate === null) throw new Error('no localStorage');
    return candidate;
  } catch {
    throw new StorageError(
      'Nettleseren din lar ikke denne siden lagre data. Åpner du fila i privat nettlesing, ' +
        'prøv et vanlig vindu — ellers blir ingenting husket når du laster siden på nytt.',
    );
  }
}

export async function readWorkspace(): Promise<Workspace> {
  const raw = store().getItem(STORAGE_KEY);
  if (raw === null) return emptyWorkspace();
  try {
    return Workspace.parse(JSON.parse(raw));
  } catch {
    // Data written by an older version that no longer parses. Losing it silently would be
    // worse than saying so: the user still has the documents it was built from.
    throw new StorageError(
      'De lagrede dataene kunne ikke leses — de er antakelig fra en tidligere versjon av ' +
        'Lønnssjekk. Velg «Slett alt» under Innstillinger for å begynne på nytt.',
    );
  }
}

export async function writeWorkspace(workspace: Workspace): Promise<Workspace> {
  const parsed = Workspace.parse({ ...workspace, updatedAt: new Date().toISOString() });
  try {
    store().setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError(
      'Det er ikke plass til å lagre mer i nettleseren. Slett noen dokumenter under ' +
        'Innstillinger, eller velg «Slett alt» og legg inn på nytt det du trenger.',
    );
  }
  return parsed;
}

/** "Slett alt": remove every trace of the user's data from this device. */
export async function deleteEverything(): Promise<void> {
  store().removeItem(STORAGE_KEY);
}

export async function hasStoredData(): Promise<boolean> {
  return store().getItem(STORAGE_KEY) !== null;
}
