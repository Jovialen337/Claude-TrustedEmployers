/**
 * Routing for the offline single-file edition.
 *
 * The file is opened from disk (`file:///…/Lonnssjekk.html`) or from a phone's Downloads, so
 * there is no server to resolve `/sjekk` and `history.pushState` to a different path is not
 * allowed on a `file://` origin. The hash is the one part of the URL a page can own
 * everywhere: `#/sjekk`. The browser's own back and forward buttons keep working, and a
 * reload lands on the same step.
 */

export const DEFAULT_PATH = '/';

/** `#/vakter` → `/vakter`; anything unexpected → `/`. */
export function pathFromHash(hash: string): string {
  const raw = hash.replace(/^#/, '');
  if (raw === '' || raw === '/') return DEFAULT_PATH;
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  // Strip a trailing slash so `/vakter/` and `/vakter` are the same step.
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

export function currentPath(): string {
  return pathFromHash(globalThis.location?.hash ?? '');
}

/** The href an in-app link needs: `/sjekk` → `#/sjekk`. */
export function hrefFor(path: string): string {
  return `#${path.startsWith('/') ? path : `/${path}`}`;
}

export function navigate(path: string): void {
  globalThis.location.hash = hrefFor(path);
}

export function subscribe(listener: () => void): () => void {
  globalThis.addEventListener('hashchange', listener);
  return () => globalThis.removeEventListener('hashchange', listener);
}
