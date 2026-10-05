/**
 * The "server", running in the page.
 *
 * Every API route handler in `src/app/api/` is a plain function from `Request` to `Response`,
 * so the offline edition does not reimplement them — it calls the same ones, with the storage
 * and Claude edges swapped by the build (see `scripts/build-offline.mjs`). `window.fetch` is
 * patched so that the pages' own `fetch('/api/check')` calls reach them, which is why not a
 * single page or `_lib/client.ts` needed changing for this build.
 *
 * Nothing here touches the network. A request to anything other than this app's own routes is
 * handed back to the browser's real fetch, which on a `file://` page will simply fail — as it
 * should, since the point of this edition is that the data never leaves the device.
 */
import { GET as checkGet } from '../app/api/check/route';
import { POST as demoPost } from '../app/api/demo/route';
import { GET as extractGet, POST as extractPost } from '../app/api/extract/route';
import { POST as importSchedulePost } from '../app/api/import-schedule/route';
import { GET as reportGet } from '../app/api/report/route';
import { DELETE as workspaceDelete, GET as workspaceGet, PUT as workspacePut } from '../app/api/workspace/route';
import { StorageError } from './browserStore';
import { ensureReady } from './shims/claude';

type Handler = (request: Request) => Promise<Response> | Response;

const ROUTES: Record<string, Partial<Record<string, Handler>>> = {
  '/api/workspace': { GET: workspaceGet, PUT: workspacePut, DELETE: workspaceDelete },
  '/api/check': { GET: checkGet },
  '/api/demo': { POST: demoPost },
  '/api/report': { GET: reportGet },
  '/api/extract': { GET: extractGet, POST: extractPost },
  '/api/import-schedule': { POST: importSchedulePost },
};

/** The path part of whatever `fetch` was called with, for a page served from a file. */
export function routePath(input: RequestInfo | URL): string | null {
  const raw =
    typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  if (raw.startsWith('/api/')) return raw.split('?')[0] ?? null;
  // A Request object has an absolute URL even on a file:// page.
  const match = /^[a-z]+:\/\/[^/]*(\/api\/[^?#]*)/.exec(raw) ?? /^file:\/\/.*(\/api\/[^?#]*)/.exec(raw);
  return match?.[1] ?? null;
}

export function isApiRequest(input: RequestInfo | URL): boolean {
  return routePath(input) !== null && ROUTES[routePath(input) as string] !== undefined;
}

export async function handleApiRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const path = routePath(input);
  const route = path === null ? undefined : ROUTES[path];
  if (route === undefined) {
    return NOT_FOUND(path ?? String(input));
  }

  // `hasApiKey()` answers synchronously inside the handlers, so whether this view can ask
  // Claude has to be settled before one runs. Memoized, so only the first call waits.
  await ensureReady();

  const method = (
    init?.method ?? (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET')
  ).toUpperCase();
  const handler = route[method];
  if (handler === undefined) {
    return json({ error: `${method} er ikke støttet for ${path}.` }, 405);
  }

  // The handlers read `request.formData()` and `request.json()`, so hand them a real Request.
  const request =
    typeof input === 'object' && 'formData' in input && init === undefined
      ? (input as Request)
      : new Request(`http://lonnssjekk.local${path}`, init);

  try {
    return await handler(request);
  } catch (error) {
    if (error instanceof StorageError) return json({ error: error.message }, 507);
    return json({ error: `Noe gikk galt: ${(error as Error).message}` }, 500);
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function NOT_FOUND(path: string): Response {
  return json({ error: `Ukjent rute: ${path}` }, 404);
}

/**
 * Patch `fetch` so the pages' own calls to this app's routes are served here.
 *
 * Returns the original, so a test can put it back.
 */
export function installApiFetch(): typeof fetch {
  const original = globalThis.fetch.bind(globalThis);
  const patched: typeof fetch = async (input, init) => {
    if (isApiRequest(input)) return handleApiRequest(input, init);
    return original(input as RequestInfo, init);
  };
  globalThis.fetch = patched;
  return original;
}
