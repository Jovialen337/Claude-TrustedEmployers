'use client';

/** Small fetch helpers. Everything talks to this app's own routes on localhost only. */
import type { CheckResult } from '@/domain/engine';
import type { Workspace } from '@/domain/schemas';

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Noe gikk galt (${response.status}).`);
  }
  return (await response.json()) as T;
}

export async function fetchWorkspace(): Promise<Workspace> {
  return json<Workspace>(await fetch('/api/workspace', { cache: 'no-store' }));
}

export async function saveWorkspace(workspace: Workspace): Promise<Workspace> {
  return json<Workspace>(
    await fetch('/api/workspace', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(workspace),
    }),
  );
}

export async function fetchCheck(): Promise<CheckResult> {
  return json<CheckResult>(await fetch('/api/check', { cache: 'no-store' }));
}

export async function loadDemo(): Promise<Workspace> {
  return json<Workspace>(await fetch('/api/demo', { method: 'POST' }));
}

export async function deleteEverything(): Promise<void> {
  await json<{ deleted: boolean }>(await fetch('/api/workspace', { method: 'DELETE' }));
}

export function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
