import { constants } from 'node:fs';
import { open, opendir, realpath } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { OrcaWorkerApi } from '../shared/orca-api';
import { MAX_SESSION_BYTES, parseSession, serializeSession, type Session } from '../shared/session-schema';
import { RequestError } from './errors';
export type LocalWorkspace = { id: string; name: string; path: string };
export async function openSessionLocation(orca: OrcaWorkerApi, file: { workspaceId: string; path: string }) {
  const workspace = (await localWorkspaces(orca)).find(item => item.id === file.workspaceId);
  if (!workspace) throw new RequestError('configuration', 'This session workspace is unavailable. Open its local folder in Orca again.');
  const path = (isAbsolute(file.path) ? relative(workspace.path, file.path) : file.path).replaceAll('\\', '/');
  if (!path || path.split('/').includes('..') || isAbsolute(path)) throw new RequestError('configuration', 'This session file is outside its recorded workspace. Open and save it again in Orca.');
  await orca.host.call('workspace.open', { workspaceId: file.workspaceId });
  return await orca.host.call('editor.open', { workspaceId: file.workspaceId, path });
}
export async function localWorkspaces(orca: OrcaWorkerApi): Promise<LocalWorkspace[]> {
  const result = await orca.host.call('workspace.list');
  const focused = await orca.host.call('workspace.readContext');
  return result.workspaces.filter(workspace => workspace.hostId === null || workspace.hostId === 'local').map(({ id, name, path }) => ({ id, name, path })).sort((a, b) => Number(b.name === focused?.displayName) - Number(a.name === focused?.displayName));
}
export async function createSessionFile(workspace: LocalWorkspace, filename: string): Promise<{ session: Session; path: string }> {
  const name = filename.trim().replace(/\.graphiql$/i, '');
  if (!name || name.length > 80 || /[\\/:*?"<>|\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) || name === '.' || name === '..') throw new RequestError('configuration', 'Choose a filename of 1–80 characters without path separators or reserved filename characters.');
  const root = await realpath(workspace.path);
  const path = join(workspace.path, name + '.graphiql');
  const session: Session = { schemaVersion: 1, sessionId: randomUUID(), name, environments: [], selectedEnvironment: null, operations: [], collections: [], preferences: { persistHistory: true } };
  let file;
  try { file = await open(join(root, name + '.graphiql'), 'wx', 0o600); }
  catch (cause) { throw new RequestError('configuration', (cause as { code?: string }).code === 'EEXIST' ? 'That session file already exists. Choose another name.' : 'Unable to create a file in this workspace. Check folder permissions.'); }
  try { await file.writeFile(serializeSession(session)); } finally { await file.close(); }
  return { session, path };
}
export async function readSessionFile(path: string): Promise<Session | null> {
  let file;
  try {
    file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const stat = await file.stat(); if (!stat.isFile() || stat.size > MAX_SESSION_BYTES) return null;
    const buffer = Buffer.alloc(MAX_SESSION_BYTES + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0); if (bytesRead > MAX_SESSION_BYTES) return null;
    return parseSession(buffer.subarray(0, bytesRead).toString('utf8'));
  } catch { return null; } finally { await file?.close(); }
}
export async function discoverSessionFiles(workspaces: LocalWorkspace[], hidden: Set<string>) {
  const matches = new Map<string, { session: Session; workspaceId: string; path: string }[]>();
  let entries = 0; const deadline = Date.now() + 2000;
  const skip = new Set(['node_modules', 'dist', 'build', 'target', 'vendor']);
  async function walk(workspace: LocalWorkspace, folder: string, depth: number) {
    if (depth > 8 || entries >= 5000 || Date.now() > deadline) return;
    try {
      const directory = await opendir(folder);
      for await (const entry of directory) {
        if (++entries > 5000 || Date.now() > deadline || matches.size >= 64) break;
        if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
        const path = join(folder, entry.name);
        if (entry.isDirectory() && !skip.has(entry.name)) await walk(workspace, path, depth + 1);
        else if (entry.isFile() && /\.graphiql(?:\.json)?$/i.test(entry.name)) {
          const session = await readSessionFile(path);
          if (session?.sessionId && !hidden.has(session.sessionId)) {
            const prior = matches.get(session.sessionId) || [];
            if (prior.length < 2) prior.push({ session, workspaceId: workspace.id, path });
            matches.set(session.sessionId, prior);
          }
        }
      }
    } catch { /* Inaccessible folders are omitted, never traversed through another path. */ }
  }
  for (const workspace of workspaces.slice(0, 16)) await walk(workspace, workspace.path, 0);
  // A copied UUID is ambiguous. Native Save can explicitly identify the intended file.
  return [...matches.values()].filter(items => items.length === 1).map(items => items[0]);
}
