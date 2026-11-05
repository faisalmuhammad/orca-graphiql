import type { EditorSession, OrcaFrameApi } from '../shared/orca-api';
import { parseSession, serializeSession, sessionSchema, type Session } from '../shared/session-schema';
import { mergeSessions } from './merge';
export type ConflictDraft = { mine: Session; outside: Session };
export async function openSession(host: OrcaFrameApi) {
  if (!host.document) throw new Error('GraphiQL must run in an Orca custom editor.');
  let conflict: ConflictDraft | null = null;
  const replacements = new Set<(value: Session, conflict: ConflictDraft | null) => void>();
  const errors = new Set<(message: string) => void>();
  const doc: EditorSession<Session> = await host.document.session({
    decode(content) { if (content.kind !== 'text') throw new Error('GraphiQL sessions must be text documents.'); return parseSession(content.text); },
    encode(value) { return { kind: 'text', text: serializeSession(value) }; },
    merge(base, outside, mine) { try { return sessionSchema.parse(mergeSessions(base, outside, mine)); } catch { conflict = { mine, outside }; return outside; } },
  });
  let initial = doc.value;
  if (!initial.sessionId) {
    initial = { ...initial, sessionId: crypto.randomUUID() };
    if (!doc.readOnly) doc.change(initial);
  }
  const sessionId = initial.sessionId!;
  const replace = doc.onReplace(value => { for (const listener of replacements) listener({ ...value, sessionId: value.sessionId || sessionId }, conflict); });
  const external = host.document.onDidChange(value => { if (value.content.kind === 'text') { try { parseSession(value.content.text); } catch (error) { for (const listener of errors) listener(error instanceof Error ? error.message : 'Invalid external session change.'); } } });
  async function flush() {
    try { await doc.flush(); } catch (error) { const message = (error as { code?: string })?.code === 'not_permitted' ? 'This session is read-only.' : 'Unable to synchronize the session. Review external changes before saving.'; for (const listener of errors) listener(message); throw new Error(message); }
  }
  return {
    initial, sessionId, get readOnly() { return doc.readOnly; },
    update(next: Session) { if (doc.readOnly) throw new Error('This session is read-only.'); if (conflict) throw new Error('Resolve the external edit conflict first.'); const valid = sessionSchema.parse(next); serializeSession(valid); doc.change(valid); },
    flush,
    resolve(choice: 'outside' | 'mine') { const draft = conflict; conflict = null; if (choice === 'mine' && draft) doc.change(draft.mine); return choice === 'mine' && draft ? draft.mine : doc.value; },
    subscribe(listener: (value: Session, draft: ConflictDraft | null) => void) { replacements.add(listener); return () => replacements.delete(listener); },
    onError(listener: (message: string) => void) { errors.add(listener); return () => errors.delete(listener); },
    dispose() { replace.dispose(); external.dispose(); doc.dispose(); },
  };
}
export type SessionController = Awaited<ReturnType<typeof openSession>>;
