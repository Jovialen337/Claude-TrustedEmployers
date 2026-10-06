/**
 * The offline single-file edition's four swapped edges.
 *
 * The point of that build is that it is the same code with different edges, so what is worth
 * testing is the edges themselves and — the one that would really hurt — that they still match
 * the shapes the rest of the app expects. A storage function added on one side and forgotten on
 * the other would break only in the built file, which no unit test would otherwise reach.
 *
 * These tests must run sequentially. They stub `globalThis.localStorage` and `globalThis.claude`
 * and reset the module registry, which is shared by every test in the file, so running them with
 * `--sequence.concurrent` makes them trip over each other. That is a property of the tests, not
 * of the code; vitest runs files sequentially within a worker by default, which is what they
 * rely on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('the Claude shim explains itself in words that fit this build', () => {
    expect(offlineClaude.unavailableReason()).toMatch(/én enkelt fil/);
    // The .env advice would be nonsense in a lone HTML file.
    expect(offlineClaude.unavailableReason()).not.toMatch(/\.env/);
    expect(realClaude.unavailableReason()).toMatch(/\.env/);
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

/**
 * Reading a document in the hosted copy.
 *
 * There is no API key in a single file, so the page asks Claude on the viewer's own account
 * through the `sample` capability. What is worth testing is that it is wired as an ordinary
 * `Send` — the prompt, the schema and the masking around it are the project's own and already
 * covered — and that every way the call can fail reaches the user as Norwegian they can act on.
 */
describe('reading documents through the viewer’s own Claude', () => {
  interface FakeCall {
    input: string;
    options?: { images?: Blob[]; cache?: boolean; modelTier?: string };
  }

  /** Install a `claude.use('sample')` host and load the shim fresh against it. */
  async function withSample(
    sample: ((input: string, options?: FakeCall['options']) => Promise<{ text: string; truncated: boolean }>) | null,
    limits: { maxPromptBytes?: number; images?: { maxCount: number } } | null = { maxPromptBytes: 262_144 },
  ) {
    const calls: FakeCall[] = [];
    const wrapped =
      sample === null
        ? null
        : Object.assign(
            async (input: string, options?: FakeCall['options']) => {
              calls.push({ input, options });
              return sample(input, options);
            },
            { limits: async () => (limits === null ? Promise.reject(new Error('no limits')) : limits) },
          );

    Object.defineProperty(globalThis, 'claude', {
      value: { use: async (name: string) => (name === 'sample' ? wrapped : null) },
      configurable: true,
    });
    vi.resetModules();
    const shim = await import('@/offline/shims/claude');
    await shim.ensureReady();
    return { shim, calls };
  }

  afterEach(() => {
    Reflect.deleteProperty(globalThis as object, 'claude');
    vi.resetModules();
  });

  it('is unavailable when the page is opened as a plain file', async () => {
    vi.resetModules();
    const shim = await import('@/offline/shims/claude');
    await shim.ensureReady();
    expect(shim.hasApiKey()).toBe(false);
    expect(() => shim.createClaudeSend()).toThrow(/én enkelt fil/);
  });

  it('is unavailable when the viewer has not allowed it', async () => {
    const { shim } = await withSample(null);
    expect(shim.hasApiKey()).toBe(false);
  });

  it('becomes available when the viewer can ask Claude', async () => {
    const { shim } = await withSample(async () => ({ text: '{"ok":true}', truncated: false }));
    expect(shim.hasApiKey()).toBe(true);
  });

  it('sends the prompt and the schema, and gives back what Claude wrote', async () => {
    const { shim, calls } = await withSample(async () => ({ text: '{"employer":"Kafé Nordlys AS"}', truncated: false }));
    const send = shim.createClaudeSend();

    const answer = await send({ prompt: 'Les denne kontrakten', schemaHint: '{"employer": string}' });

    expect(answer).toBe('{"employer":"Kafé Nordlys AS"}');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.input).toContain('Les denne kontrakten');
    expect(calls[0]!.input).toContain('{"employer": string}');
    // The framing the real client sends as a system prompt leads the prompt here instead.
    expect(calls[0]!.input).toMatch(/svarer bare med JSON/);
    // A re-ask after failed validation must really ask again, not replay a cached answer.
    expect(calls[0]!.options?.cache).toBe(false);
  });

  it('passes the validation error back on a re-ask', async () => {
    const { shim, calls } = await withSample(async () => ({ text: '{}', truncated: false }));
    await shim.createClaudeSend()({
      prompt: 'p',
      schemaHint: 's',
      previousError: 'stillingsprosent: Required',
    });
    expect(calls[0]!.input).toContain('stillingsprosent: Required');
  });

  it('turns an image into a blob for the call', async () => {
    const { shim, calls } = await withSample(
      async () => ({ text: '{}', truncated: false }),
      { maxPromptBytes: 262_144, images: { maxCount: 4 } },
    );
    expect(shim.canSendImages()).toBe(true);

    await shim.createClaudeSend()({
      prompt: 'p',
      schemaHint: 's',
      // "hei" in base64.
      image: { mediaType: 'image/png', base64: 'aGVp' },
    });

    const images = calls[0]!.options?.images;
    expect(images).toHaveLength(1);
    expect(images![0]!.type).toBe('image/png');
    expect(await images![0]!.text()).toBe('hei');
  });

  it('knows when this view cannot send images at all', async () => {
    const { shim } = await withSample(async () => ({ text: '{}', truncated: false }), {
      maxPromptBytes: 262_144,
    });
    expect(shim.canSendImages()).toBe(false);
  });

  it('refuses a document too long to read, instead of sending and failing', async () => {
    const { shim, calls } = await withSample(async () => ({ text: '{}', truncated: false }), {
      maxPromptBytes: 200,
    });
    await expect(
      shim.createClaudeSend()({ prompt: 'x'.repeat(5000), schemaHint: 's' }),
    ).rejects.toThrow(/for langt/);
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['not_granted', /ikke gitt denne siden lov/],
    ['rate_limited', /for mange forespørsler/],
    ['session_expired', /logge inn/],
    ['refused', /ville ikke lese/],
    ['prompt_too_large', /for langt/],
    ['image_rejected', /Bildet kunne ikke leses/],
  ])('explains a %s failure in Norwegian', async (code, expected) => {
    const { shim } = await withSample(async () => {
      throw { code, message: 'english developer text' };
    });
    await expect(shim.createClaudeSend()({ prompt: 'p', schemaHint: 's' })).rejects.toThrow(expected);
  });

  it('has something to say about a failure code it has never seen', async () => {
    const { shim } = await withSample(async () => {
      throw { code: 'something_new', message: 'x' };
    });
    await expect(shim.createClaudeSend()({ prompt: 'p', schemaHint: 's' })).rejects.toThrow(
      /Prøv igjen, eller legg inn opplysningene selv/,
    );
  });

  it('survives a view whose limits cannot be read', async () => {
    const { shim } = await withSample(async () => ({ text: '{}', truncated: false }), null);
    expect(shim.hasApiKey()).toBe(true);
    expect(shim.canSendImages()).toBe(false);
  });
});
