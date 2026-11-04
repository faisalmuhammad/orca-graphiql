import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionFile, discoverSessionFiles, readSessionFile } from '../src/worker/session-files';
import { mockWorker } from './helpers/worker';
const roots: string[] = [];
async function workspace() { const path = await mkdtemp(join(tmpdir(), 'graphiql-files-')); roots.push(path); return { id: 'workspace-test', name: 'Fixture', path }; }
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
describe('workspace session files', () => {
  it('creates an empty identified session, refuses overwrites, and rejects unsafe filenames', async () => {
    const root = await workspace();
    const created = await createSessionFile(root, 'My session.graphiql');
    expect(created.path).toBe(join(root.path, 'My session.graphiql'));
    expect(created.session.environments).toEqual([]); expect(created.session.operations).toEqual([]);
    expect(created.session.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(createSessionFile(root, 'My session')).rejects.toThrow('already exists');
    for (const filename of ['../escape', 'a/b', 'a\\b', 'CON', 'a?', '.']) await expect(createSessionFile(root, filename)).rejects.toThrow('filename');
    expect(JSON.parse(await readFile(created.path, 'utf8')).name).toBe('My session');
  });
  it('discovers valid sessions and omits hidden records, ignored directories, and duplicate IDs', async () => {
    const root = await workspace(); const first = await createSessionFile(root, 'First');
    await mkdir(join(root.path, 'node_modules')); await writeFile(join(root.path, 'node_modules', 'ignored.graphiql'), await readFile(first.path));
    expect(await discoverSessionFiles([root], new Set())).toHaveLength(1);
    expect(await discoverSessionFiles([root], new Set([first.session.sessionId!]))).toHaveLength(0);
    await writeFile(join(root.path, 'Copied.graphiql'), await readFile(first.path));
    expect(await discoverSessionFiles([root], new Set())).toHaveLength(0);
  });
  it('does not read oversized files or follow symlink files', async () => {
    const root = await workspace(); const file = await createSessionFile(root, 'Source');
    await writeFile(join(root.path, 'huge.graphiql'), ' '.repeat(800000));
    expect(await readSessionFile(join(root.path, 'huge.graphiql'))).toBeNull();
    if (process.platform !== 'win32') { await symlink(file.path, join(root.path, 'link.graphiql')); expect(await readSessionFile(join(root.path, 'link.graphiql'))).toBeNull(); }
  });
  it('creates and opens a session through the worker using the selected local workspace', async () => {
    const root = await workspace(); const worker = mockWorker();
    worker.api.host.call.mockImplementation(async method => method === 'workspace.list' ? { workspaces: [{ ...root, hostId: null }], truncated: false } as any : { opened: true } as any);
    const result = await worker.call('sessions.create', { workspaceId: root.id, filename: 'Created through Explorer' });
    expect(result).toEqual({ ok: true, value: { created: true, opened: true } });
    expect(worker.api.host.call).toHaveBeenCalledWith('workspace.open', { workspaceId: root.id });
    expect(worker.api.host.call).toHaveBeenCalledWith('editor.open', { workspaceId: root.id, path: 'Created through Explorer.graphiql' });
    expect((await worker.call('activity.list'))[0].file.path).toContain('Created through Explorer.graphiql');
  });
});
