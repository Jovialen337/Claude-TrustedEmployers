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
