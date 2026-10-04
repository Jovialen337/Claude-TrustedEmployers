/**
 * The offline single-file edition's four swapped edges.
 *
 * The point of that build is that it is the same code with different edges, so what is worth
 * testing is the edges themselves and — the one that would really hurt — that they still match
 * the shapes the rest of the app expects. A storage function added on one side and forgotten on
 * the other would break only in the built file, which no unit test would otherwise reach.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as browserStore from '@/offline/browserStore';
import * as fileStore from '@/storage/workspaceStore';
import * as offlineClaude from '@/offline/shims/claude';
import * as realClaude from '@/extraction/claude';
import { NextResponse } from '@/offline/shims/nextServer';
import { DEFAULT_PATH, hrefFor, pathFromHash } from '@/offline/navigation';
import { demoWorkspace } from '@/demo/workspace';
import { emptyWorkspace } from '@/domain/schemas';

/** A localStorage good enough to test against, with a settable ceiling. */
class MemoryStorage {
  private map = new Map<string, string>();
  limit = Number.POSITIVE_INFINITY;

  get length() {
    return this.map.size;
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (value.length > this.limit) {
      const error = new Error('QuotaExceededError');
      error.name = 'QuotaExceededError';
      throw error;
    }
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis as object, 'localStorage');
});

describe('browserStore', () => {
  it('starts empty, like a machine with no data file', async () => {
    const workspace = await browserStore.readWorkspace();
    expect(workspace.contract).toBeNull();
    expect(workspace.shifts).toEqual([]);
    expect(storage.getItem(browserStore.STORAGE_KEY)).toBeNull();
  });

  it('round-trips a workspace through localStorage', async () => {
    const written = await browserStore.writeWorkspace(demoWorkspace());
    const read = await browserStore.readWorkspace();

    expect(read.shifts).toHaveLength(written.shifts.length);
    expect(read.contract?.employer).toBe('Kafé Nordlys AS');
    expect(read.contract?.employer).toBe(written.contract?.employer);
    expect(read.payslips).toHaveLength(3);
  });

  it('stamps updatedAt on every write, as the file store does', async () => {
    const before = emptyWorkspace('2020-01-01T00:00:00.000Z');
    const after = await browserStore.writeWorkspace(before);
    expect(after.updatedAt).not.toBe(before.updatedAt);
    expect(Date.parse(after.updatedAt)).toBeGreaterThan(Date.parse(before.updatedAt));
  });

  it('reports having data only once something is stored', async () => {
    expect(await browserStore.hasStoredData()).toBe(false);
    await browserStore.writeWorkspace(emptyWorkspace());
    expect(await browserStore.hasStoredData()).toBe(true);
  });

  it('"Slett alt" leaves nothing behind', async () => {
    await browserStore.writeWorkspace(demoWorkspace());
    await browserStore.deleteEverything();
    expect(storage.getItem(browserStore.STORAGE_KEY)).toBeNull();
    expect(await browserStore.hasStoredData()).toBe(false);
  });

  it('says so in Norwegian when the browser is out of room, rather than losing the data quietly', async () => {
    storage.limit = 10;
    await expect(browserStore.writeWorkspace(demoWorkspace())).rejects.toBeInstanceOf(
      browserStore.StorageError,
    );
    await expect(browserStore.writeWorkspace(demoWorkspace())).rejects.toThrow(/ikke plass/);
  });

  it('explains unreadable stored data instead of throwing a parser error at the user', async () => {
    storage.setItem(browserStore.STORAGE_KEY, '{"version":1,"shifts":"not an array"}');
    await expect(browserStore.readWorkspace()).rejects.toBeInstanceOf(browserStore.StorageError);
    await expect(browserStore.readWorkspace()).rejects.toThrow(/Slett alt/);
  });

  it('explains a browser that refuses to store anything at all', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      get() {
        throw new Error('blocked');
      },
      configurable: true,
    });
    await expect(browserStore.readWorkspace()).rejects.toThrow(/privat nettlesing/);
  });
});

describe('the swapped edges keep the shape the app expects', () => {
  it('the browser store exports everything the file store does', () => {
    const required = Object.keys(fileStore).filter(
      (name) => typeof (fileStore as Record<string, unknown>)[name] === 'function',
    );
    // dataDir/workspacePath are about a filesystem and have no meaning in a browser.
    const expected = required.filter((name) => !['dataDir', 'workspacePath'].includes(name));
    expect(Object.keys(browserStore)).toEqual(expect.arrayContaining(expected));
  });

  it('the Claude shim exports everything the real client does', () => {
    const required = Object.keys(realClaude);
    expect(Object.keys(offlineClaude)).toEqual(expect.arrayContaining(required));
  });

  it('the Claude shim reports reading as unavailable, with a reason that fits this build', () => {
    expect(offlineClaude.hasApiKey()).toBe(false);
    expect(offlineClaude.unavailableReason()).toMatch(/én enkelt fil/);
    // The .env advice would be nonsense in a lone HTML file.
    expect(offlineClaude.unavailableReason()).not.toMatch(/\.env/);
    expect(realClaude.unavailableReason()).toMatch(/\.env/);
  });

  it('the Claude shim refuses to send, rather than pretending to', () => {
    expect(() => offlineClaude.createClaudeSend()).toThrow(/offline-utgaven/);
  });

  it('NextResponse.json matches what the route handlers rely on', async () => {
    const ok = NextResponse.json({ a: 1 });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('application/json');
    expect(await ok.json()).toEqual({ a: 1 });

    const bad = NextResponse.json({ error: 'nope' }, { status: 400 });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'nope' });
  });
});

describe('hash routing', () => {
  it('reads the step out of the hash', () => {
    expect(pathFromHash('#/sjekk')).toBe('/sjekk');
    expect(pathFromHash('#/innstillinger')).toBe('/innstillinger');
  });

  it('treats no hash, a bare hash and a lone slash as the start page', () => {
    expect(pathFromHash('')).toBe(DEFAULT_PATH);
    expect(pathFromHash('#')).toBe(DEFAULT_PATH);
    expect(pathFromHash('#/')).toBe(DEFAULT_PATH);
  });

  it('tolerates a missing leading slash and a trailing one', () => {
    expect(pathFromHash('#vakter')).toBe('/vakter');
    expect(pathFromHash('#/vakter/')).toBe('/vakter');
  });

  it('turns a step into the href a link needs', () => {
    expect(hrefFor('/sjekk')).toBe('#/sjekk');
    expect(hrefFor('sjekk')).toBe('#/sjekk');
    // Round trip: every step in the shell survives being linked and read back.
    for (const path of ['/', '/kontrakt', '/vakter', '/lonnsslipper', '/les', '/sjekk', '/rapport', '/innstillinger']) {
      expect(pathFromHash(hrefFor(path))).toBe(path);
    }
  });
});
