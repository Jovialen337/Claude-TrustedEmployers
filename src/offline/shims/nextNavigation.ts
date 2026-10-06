/**
 * `next/navigation` for the offline edition. Only `usePathname` is used by the app (the shell
 * ticks the step you are on); `useRouter().push` is here because a page added later would
 * reach for it, and silently doing nothing would be worse than navigating.
 */
import { useSyncExternalStore } from 'react';
import { currentPath, navigate, subscribe } from '../navigation';

export function usePathname(): string {
  return useSyncExternalStore(subscribe, currentPath, () => currentPath());
}

export function useRouter() {
  return {
    push: (path: string) => navigate(path),
    replace: (path: string) => navigate(path),
    back: () => globalThis.history.back(),
    forward: () => globalThis.history.forward(),
    refresh: () => undefined,
    prefetch: () => undefined,
  };
}
