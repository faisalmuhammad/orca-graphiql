import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GraphQLSchema } from 'graphql';
import type { OrcaFrameApi } from '../shared/orca-api';
import { isRemoteHttp, type Environment, type Session } from '../shared/session-schema';
import { requestTooLarge, REQUEST_LIMIT_MESSAGE, type Connection, type CredentialInput, type Failure } from '../shared/protocol';
import type { ConflictDraft, SessionController } from '../persistence/session';
import { createCollectionsStorage } from '../persistence/collections';
import { createSessionStorage, type SessionStorage } from '../persistence/storage';
import { createWorkerTransport } from './transport';
import { ConnectionSettings } from './ConnectionSettings';
import { GraphiQLView } from './GraphiQLView';
import { Modal } from './Modal';
export function App({ host, controller }: { host: OrcaFrameApi; controller: SessionController }) {
  const [session, setSession] = useState(controller.initial);
  const sessionRef = useRef(session); sessionRef.current = session;
  const [connection, setConnection] = useState<Connection | null>(null);
  const connectionRef = useRef(connection); connectionRef.current = connection;
  const [status, setStatus] = useState('Disconnected');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<ConflictDraft | null>(null);
  const [secure, setSecure] = useState(false);
  const [settings, setSettings] = useState<Environment | null | undefined>(undefined);
  const [credential, setCredential] = useState<{ environmentId: string; endpoint: string; input: CredentialInput } | null>(null);
  const [storage, setStorage] = useState<SessionStorage | null>(null);
  const [version, setVersion] = useState(0);
  const [theme, setTheme] = useState<'light' | 'dark'>(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  const [confirmation, setConfirmation] = useState<{ title: string; text: string; resolve: (answer: boolean) => void } | null>(null);
  const confirmationRef = useRef(confirmation); confirmationRef.current = confirmation;
  const queryRef = useRef<string | undefined>(undefined);
  const variablesRef = useRef<string | undefined>(undefined);
  const schemaCache = useRef(new Map<string, { value: GraphQLSchema; at: number }>());
  const environment = session.environments.find(env => env.id === session.selectedEnvironment) || null;
  const environmentKey = JSON.stringify(environment);
  const bridgeRef = useRef<ReturnType<typeof createWorkerTransport> | null>(null);
  const connectAbort = useRef<AbortController | null>(null);
  const epoch = useRef(0);
  const ask = useCallback((title: string, text: string) => new Promise<boolean>(resolve => setConfirmation({ title, text, resolve })), []);
  function answer(value: boolean) { confirmationRef.current?.resolve(value); confirmationRef.current = null; setConfirmation(null); }
  const stop = useCallback(() => {
    epoch.current++; connectAbort.current?.abort(); connectAbort.current = null; bridgeRef.current?.dispose();
    confirmationRef.current?.resolve(false); confirmationRef.current = null; setConfirmation(null);
    const current = connectionRef.current;
    if (current) void host.plugin.request('connection.disconnect', { approvalId: current.approvalId }).catch(() => {});
    connectionRef.current = null; setConnection(null); setCredential(null); setStatus('Disconnected');
  }, [host]);
  const failure = useCallback((value: Failure) => { setError(value.message); setStatus(value.kind === 'authentication' ? 'Authentication failed' : value.kind === 'tls' ? 'TLS error' : value.kind === 'network' ? 'Network error' : value.kind); if (value.kind === 'approval') stop(); }, [stop]);
  const bridge = useMemo(() => createWorkerTransport(host, environment, connection?.approvalId || null, { status: setStatus, failure, confirmMutation: operation => ask('Confirm production mutation', 'Send ' + operation + ' to ' + environment?.name + '? This safeguard cannot guarantee that read-only operations have no side effects.') }), [host, environmentKey, connection?.approvalId, ask, failure]);
  bridgeRef.current = bridge;
  useEffect(() => () => bridge.dispose(), [bridge]);
  useEffect(() => {
    let alive = true;
    let current: SessionStorage | undefined;
    setStorage(null);
    createSessionStorage(host.storage, controller.sessionId, environment?.id || 'unconfigured', session.preferences.persistHistory && !controller.readOnly, environment?.endpoint || '').then(value => { current = value; if (alive) setStorage(value); else value.dispose(); }).catch(() => { if (alive) setError('Unable to load local GraphiQL history.'); });
    return () => { alive = false; if (current) { void current.flush().catch(() => {}); current.dispose(); } };
  }, [host, controller, environment?.id, environment?.endpoint, session.preferences.persistHistory]);
  useEffect(() => {
    const subscription = host.on('theme', ({ colorScheme }) => setTheme(colorScheme));
    const unsubscribe = controller.subscribe((value, draft) => { stop(); setSession(value); setConflict(draft); schemaCache.current.clear(); queryRef.current = undefined; variablesRef.current = undefined; setVersion(v => v + 1); });
    const errors = controller.onError(setError);
    void host.plugin.request('connection.protection').then(result => { if (result.ok) setSecure(result.value.secure); }).catch(() => {});
    const controls = host.plugin.on('editor.control', ({ action }) => { if (action === 'disconnect') stop(); else if (action === 'cancel') bridgeRef.current?.cancel(); else { schemaCache.current.clear(); setVersion(v => v + 1); } });
    const rename = host.plugin.on('editor.rename', async ({ requestId, name }) => {
      let ok = false;
      try { const next = { ...sessionRef.current, name }; controller.update(next); setSession(next); await controller.flush(); ok = true; }
      catch { setError('Unable to rename this session. Check read-only status and external edits.'); }
      await host.plugin.request('activity.rename-result', { requestId, ok }).catch(() => {});
    });
    return () => { subscription.dispose(); controls.dispose(); rename.dispose(); unsubscribe(); errors(); };
  }, [host, controller, stop]);
  useEffect(() => { void host.plugin.request('activity.register', { sessionId: controller.sessionId, name: session.name, environment: environment?.name || 'Not configured', endpoint: environment?.endpoint || '', production: environment?.production || false, readOnly: controller.readOnly }).catch(() => {}); }, [host, controller.sessionId, session.name, environment?.name, environment?.endpoint, environment?.production]);
  useEffect(() => {
    const flush = host.on('editor.flush', async () => { await storage?.flush(); await controller.flush(); });
    const close = () => { bridgeRef.current?.dispose(); connectAbort.current?.abort(); void host.plugin.request('activity.closed').catch(() => {}); void storage?.flush().catch(() => {}); controller.dispose(); };
    window.addEventListener('pagehide', close);
    return () => { flush.dispose(); window.removeEventListener('pagehide', close); };
  }, [host, controller, storage]);
  function change(next: Session) { try { controller.update(next); setSession(next); setError(''); } catch (error) { setError(error instanceof Error ? error.message : 'Unable to update this session.'); } }
  function select(id: string) { if (id === '@new') { setSettings(null); return; } stop(); const next = { ...session, selectedEnvironment: id || null }; if (controller.readOnly) setSession(next); else change(next); setVersion(v => v + 1); }
  async function connect() {
    if (!environment) { setSettings(null); return; }
    const pending = credential;
    stop();
    const generation = epoch.current;
    let allowInsecure = false;
    let attemptAbort: AbortController | null = null;
    try {
      if (isRemoteHttp(environment.endpoint)) { allowInsecure = await ask('Unencrypted endpoint', 'This remote HTTP endpoint exposes requests and credentials on the network. Connect to ' + environment.endpoint + '?'); if (!allowInsecure || generation !== epoch.current) return; }
      const abort = new AbortController(); attemptAbort = abort; connectAbort.current = abort; setStatus('Connecting'); setError('');
      const input = { sessionId: controller.sessionId, environment, allowInsecure, ...(pending?.environmentId === environment.id && pending.endpoint === environment.endpoint ? { credential: pending.input } : {}) };
      if (requestTooLarge(input)) throw new Error(REQUEST_LIMIT_MESSAGE);
      const result = await host.plugin.request('connection.approve', input, { signal: abort.signal, timeoutMs: environment.timeoutMs + 10000 });
      if (generation !== epoch.current) return;
      if (!result.ok) { failure(result.error); return; }
      const nextEnvironment = { ...environment, auth: result.value.auth };
      if (!controller.readOnly && JSON.stringify(nextEnvironment.auth) !== JSON.stringify(environment.auth)) change({ ...sessionRef.current, environments: sessionRef.current.environments.map(env => env.id === environment.id ? nextEnvironment : env) });
      setConnection(result.value); connectionRef.current = result.value; setStatus('Connected'); setError(result.value.warning || ''); setCredential(null); setVersion(v => v + 1);
    } catch (error) { if (generation === epoch.current) { setError(error instanceof Error ? error.message : 'Connection failed.'); setStatus('Disconnected'); } }
    finally { if (connectAbort.current === attemptAbort) connectAbort.current = null; }
  }
  function apply(env: Environment, input: CredentialInput | undefined, metadata: { name: string; persistHistory: boolean }) {
    stop();
    for (const key of schemaCache.current.keys()) if (JSON.parse(key)?.id === env.id) schemaCache.current.delete(key);
    const next = { ...session, name: metadata.name, preferences: { persistHistory: metadata.persistHistory }, environments: session.environments.some(item => item.id === env.id) ? session.environments.map(item => item.id === env.id ? env : item) : [...session.environments, env], selectedEnvironment: env.id };
    if (controller.readOnly) setSession(next); else change(next);
    if (input) setCredential({ environmentId: env.id, endpoint: env.endpoint, input });
    setSettings(undefined); setVersion(v => v + 1);
  }
  const collections = useMemo(() => createCollectionsStorage(controller, () => sessionRef.current, setSession, setError), [controller]);
  function cacheSchema(value: GraphQLSchema) {
    schemaCache.current.delete(environmentKey);
    schemaCache.current.set(environmentKey, { value, at: Date.now() });
    if (schemaCache.current.size > 32) schemaCache.current.delete(schemaCache.current.keys().next().value!);
  }
  const cached = schemaCache.current.get(environmentKey);
  const schema = connection ? cached && Date.now() - cached.at < 5 * 60 * 1000 ? cached.value : undefined : null;
  return <main className="orca-graphiql"><header className="session-toolbar"><strong title="GraphiQL for Orca">{session.name || 'GraphiQL for Orca'}</strong><select aria-label="Active environment" value={session.selectedEnvironment || ''} onChange={event => select(event.target.value)}><option value="">Choose environment</option>{session.environments.map(env => <option key={env.id} value={env.id}>{env.name}{env.production ? ' · Production' : ''}</option>)}{!controller.readOnly && <option value="@new">Add environment…</option>}</select><button onClick={() => setSettings(environment)}>Connection settings</button><button onClick={connect} disabled={status === 'Connecting'}>{status === 'Connecting' ? 'Connecting…' : 'Connect / Test'}</button>{connection && <button onClick={stop}>Disconnect</button>}<span role="status" className="connection-status">{environment ? status : 'Not configured'}{connection?.temporary ? ' · Temporary credentials' : ''}</span></header>
    {controller.readOnly && <div className="notice">Read-only session. You can run operations and use temporary credentials.</div>}
    {error && <div role="alert" className="notice error"><span>{error}</span><button aria-label="Dismiss message" onClick={() => setError('')}>×</button></div>}
    {conflict && <div role="alert" className="notice error"><span>External edits conflict with your unsaved configuration. Your draft is retained.</span><button onClick={() => { setSession(controller.resolve('outside')); setConflict(null); }}>Use external version</button><button onClick={() => { setSession(controller.resolve('mine')); setConflict(null); }}>Keep my configuration</button></div>}
    <div className="ide">{storage ? <GraphiQLView key={(environment?.id || 'empty') + ':' + version} transport={bridge.transport} schema={schema} storage={storage} session={session} query={queryRef.current} variables={variablesRef.current} theme={theme} onQuery={query => { queryRef.current = query; }} onVariables={variables => { variablesRef.current = variables; }} onSchema={cacheSchema} collections={collections} readOnly={controller.readOnly} /> : <div className="loading" role="status">Loading GraphiQL…</div>}</div>
    {settings !== undefined && <ConnectionSettings environment={settings} session={{ name: session.name, persistHistory: session.preferences.persistHistory }} secure={secure} readOnly={controller.readOnly} onApply={apply} onClose={() => setSettings(undefined)} onRemove={() => { if (!settings) return; stop(); const remaining = session.environments.filter(env => env.id !== settings.id); change({ ...session, environments: remaining, selectedEnvironment: session.selectedEnvironment === settings.id ? remaining[0]?.id || null : session.selectedEnvironment }); setSettings(undefined); }} />}
    {confirmation && <Modal title={confirmation.title} onClose={() => answer(false)}><p>{confirmation.text}</p><div className="dialog-actions"><button onClick={() => answer(false)}>Cancel</button><button className="primary" onClick={() => answer(true)}>Confirm</button></div></Modal>}
  </main>;
}
