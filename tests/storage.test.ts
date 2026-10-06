import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { demoWorkspace } from '@/demo/workspace';
import { emptyWorkspace } from '@/domain/schemas';
import { deleteEverything, hasStoredData, readWorkspace, writeWorkspace, workspacePath } from '@/storage/workspaceStore';

let directory: string;
const originalEnv = process.env.LONNSSJEKK_DATA_DIR;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lonnssjekk-test-'));
  process.env.LONNSSJEKK_DATA_DIR = directory;
});

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
  if (originalEnv === undefined) delete process.env.LONNSSJEKK_DATA_DIR;
  else process.env.LONNSSJEKK_DATA_DIR = originalEnv;
});

describe('lokal lagring', () => {
  it('gir et tomt arbeidsrom når ingenting er lagret', async () => {
    expect(await hasStoredData()).toBe(false);
    const workspace = await readWorkspace();
    expect(workspace.contract).toBeNull();
    expect(workspace.shifts).toEqual([]);
  });

  it('lagrer og leser tilbake uten å endre dataene', async () => {
    const saved = await writeWorkspace(demoWorkspace());
    const loaded = await readWorkspace();
    expect(loaded.shifts).toHaveLength(saved.shifts.length);
    expect(loaded.contract!.employer).toBe('Kafé Nordlys AS');
    expect(loaded.payslips).toHaveLength(3);
  });

  it('setter updatedAt ved lagring', async () => {
    const before = emptyWorkspace('2020-01-01T00:00:00.000Z');
    const saved = await writeWorkspace(before);
    expect(saved.updatedAt).not.toBe(before.updatedAt);
    expect(saved.createdAt).toBe(before.createdAt);
  });

  it('etterlater ingen midlertidige filer', async () => {
    await writeWorkspace(demoWorkspace());
    const files = await fs.readdir(directory);
    expect(files).toEqual(['workspace.json']);
  });

  it('tåler to lagringer som skjer samtidig', async () => {
    // Det skjer i appen: en side lagrer dokumentet og posten det kom fra, eller det står to
    // faner åpne. Med bare pid-en i navnet på den midlertidige fila valgte begge samme fil, og
    // den som kom sist feilet med ENOENT fordi den første alt hadde flyttet den — altså en
    // lagring som i stillhet ikke ble utført.
    const first = { ...demoWorkspace(), createdAt: '2026-01-01T00:00:00.000Z' };
    const second = { ...demoWorkspace(), createdAt: '2026-02-02T00:00:00.000Z' };

    const [a, b] = await Promise.all([writeWorkspace(first), writeWorkspace(second)]);

    // Begge skal ha lykkes, ikke kastet.
    expect(a.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(b.createdAt).toBe('2026-02-02T00:00:00.000Z');

    // Og fila på disk skal være én av dem, hel og lesbar — aldri halvskrevet.
    const stored = await readWorkspace();
    expect(['2026-01-01T00:00:00.000Z', '2026-02-02T00:00:00.000Z']).toContain(stored.createdAt);
    expect(stored.shifts).toHaveLength(demoWorkspace().shifts.length);
    expect(await fs.readdir(directory)).toEqual(['workspace.json']);
  });

  it('lar ikke mange samtidige lagringer etterlate søppel', async () => {
    await Promise.all(Array.from({ length: 12 }, () => writeWorkspace(demoWorkspace())));
    expect(await fs.readdir(directory)).toEqual(['workspace.json']);
    expect((await readWorkspace()).contract?.employer).toBe('Kafé Nordlys AS');
  });

  it('sletter alt', async () => {
    await writeWorkspace(demoWorkspace());
    expect(await hasStoredData()).toBe(true);
    await deleteEverything();
    expect(await hasStoredData()).toBe(false);
    await expect(fs.stat(workspacePath())).rejects.toThrow();
    // Og etterpå er vi tilbake til et tomt arbeidsrom, ikke en feil.
    expect((await readWorkspace()).contract).toBeNull();
  });
});
