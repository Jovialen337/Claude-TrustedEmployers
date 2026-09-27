/**
 * Local storage: one JSON file on the user's own machine.
 *
 * No database, no accounts, no network. "Slett alt" deletes the whole directory, which is
 * the only copy that ever existed.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Workspace, emptyWorkspace } from '../domain/schemas';

export function dataDir(): string {
  // The bundler cannot see through an env-var path, and warns that it may need to trace the
  // whole filesystem. This is a local app reading its own data directory, so opt out.
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.LONNSSJEKK_DATA_DIR ?? '.data');
}

export function workspacePath(): string {
  return path.join(dataDir(), 'workspace.json');
}

export async function readWorkspace(): Promise<Workspace> {
  try {
    const raw = await fs.readFile(workspacePath(), 'utf8');
    return Workspace.parse(JSON.parse(raw));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return emptyWorkspace();
    throw error;
  }
}

/** Write atomically (temp file + rename) so a crash cannot leave a half-written workspace. */
export async function writeWorkspace(workspace: Workspace): Promise<Workspace> {
  const parsed = Workspace.parse({ ...workspace, updatedAt: new Date().toISOString() });
  await fs.mkdir(dataDir(), { recursive: true });
  const target = workspacePath();
  const temp = `${target}.tmp-${process.pid}`;
  await fs.writeFile(temp, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  await fs.rename(temp, target);
  return parsed;
}

/** "Slett alt": remove every trace of the user's data from disk. */
export async function deleteEverything(): Promise<void> {
  await fs.rm(dataDir(), { recursive: true, force: true });
}

export async function hasStoredData(): Promise<boolean> {
  try {
    await fs.stat(workspacePath());
    return true;
  } catch {
    return false;
  }
}
