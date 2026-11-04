import { createHash, randomUUID } from 'node:crypto';
import type { OrcaWorkerApi, PanelRequestContext } from '../shared/orca-api';
import { environmentSchema, canonicalEndpoint, isRemoteHttp, runtimeHeadersSchema, parseSession, type Environment } from '../shared/session-schema';
import { LIMITS, type Activity, type ApprovalInput, type Connection, type ExecuteInput } from '../shared/protocol';
import { resolveCredentials, secureAvailable } from './credentials';
import { outcome, RequestError } from './errors';
import { httpExecute, operationKind } from './transport';
import { createSessionFile, discoverSessionFiles, localWorkspaces, openSessionLocation } from './session-files';
type Approval = { id: string; editorId: string; sessionId: string; environment: Environment; headers: Record<string, string>; lastUsed: number };
type Running = { id: string; editorId: string; fingerprint: string; abort: AbortController };
export default function activate(orca: OrcaWorkerApi) {
  const approvals = new Map<string, Approval>();
  const requests = new Map<string, Running>();
  const activity = new Map<string, Activity>();
  const saved = new Map<string, Activity>();
  const hidden = new Set<string>();
  const renames = new Map<string, { editorId: string; resolve: (ok: boolean) => void }>();
  const initialized = Promise.all([orca.storage.get('saved-sessions'), orca.storage.get('hidden-sessions')]).then(([value, removed]) => {
    if (Array.isArray(removed)) for (const id of removed) if (typeof id === 'string') hidden.add(id);
    if (Array.isArray(value)) for (const item of value.slice(-64)) {
      if (item && typeof item === 'object' && !Array.isArray(item) && typeof item.sessionId === 'string' && typeof item.name === 'string' && typeof item.environment === 'string' && item.file && typeof item.file === 'object' && !Array.isArray(item.file) && typeof item.file.workspaceId === 'string' && typeof item.file.path === 'string') saved.set(item.sessionId, item as unknown as Activity);
    }
  }).catch(() => {});
  let postTimer: ReturnType<typeof setTimeout> | undefined;
  let persistence = Promise.resolve();
  let scanning: Promise<void> | null = null;
  function persistSaved() { const snapshot = [...saved.values()].slice(-64); persistence = persistence.catch(() => {}).then(() => orca.storage.set('saved-sessions', snapshot)).catch(cause => { throw hostFailure('save the session index', cause); }); return persistence; }
  function hostFailure(action: string, cause: unknown) {
    const raw = (cause as { code?: string })?.code || '';
    const code = ['invalid_params', 'unknown_method', 'capability_denied', 'consent_required', 'not_permitted', 'unavailable', 'action_failed', 'cancelled', 'timeout'].includes(raw) ? raw : 'action_failed';
    return new RequestError('configuration', 'Orca could not ' + action + ' (' + code + '). Check plugin approval and workspace availability.');
  }
  function refreshFiles(): Promise<void> { return scanning ||= scanFiles().finally(() => { scanning = null; }); }
  async function scanFiles() {
    await initialized;
    const found = await discoverSessionFiles(await localWorkspaces(orca), hidden);
    for (const { session, workspaceId, path } of found) {
      const previous = saved.get(session.sessionId!);
      const environment = session.environments.find(env => env.id === session.selectedEnvironment);
      let endpointHost = ''; try { endpointHost = new URL(canonicalEndpoint(environment?.endpoint || '')).host; } catch {}
      const item: Activity = { sessionId: session.sessionId!, name: session.name, environment: environment?.name || 'Not configured', endpointHost, production: environment?.production || false, status: 'Closed', editorId: '', connected: false, busy: false, readOnly: false, lastRun: previous?.lastRun || null, durationMs: previous?.durationMs || null, ...(previous?.lastOperation ? { lastOperation: previous.lastOperation } : {}), file: { workspaceId, path } };
      saved.set(item.sessionId, item);
      if (saved.size > 64) saved.delete(saved.keys().next().value!);
      for (const current of activity.values()) if (current.sessionId === item.sessionId) current.file = item.file;
    }
    await persistSaved(); changed();
  }
  function changed() {
    if (postTimer) return;
    postTimer = setTimeout(() => { orca.panels.post('activity.changed', { at: Date.now() }); postTimer = undefined; }, 250);
    const saved = [...activity.values()].slice(-32).map(({ connected, busy, editorId, status, ...value }) => ({ ...value, connected: false, busy: false, editorId: '', status: 'Closed' }));
    persistence = persistence.then(() => orca.storage.set('activity', saved)).catch(() => {});
  }
  function update(editorId: string, patch: Partial<Activity>) { const item = activity.get(editorId); if (item) { Object.assign(item, patch); changed(); } }
  function cancelEditor(editorId: string) { for (const request of requests.values()) if (request.editorId === editorId) request.abort.abort(); }
  function forgetEditor(editorId: string) { cancelEditor(editorId); for (const [id, value] of approvals) if (value.editorId === editorId) approvals.delete(id); update(editorId, { connected: false, busy: false, status: 'Disconnected' }); }
  orca.hooks.on('editor.save.before', async event => {
    if (!event.workspaceId || !/\.graphiql(?:\.json)?$/i.test(event.path)) return;
    let session; try { session = parseSession(event.text); } catch { return; }
    if (!session.sessionId) return;
    await initialized;
    if (hidden.delete(session.sessionId)) await orca.storage.set('hidden-sessions', [...hidden]);
    const previous = [...activity.values()].find(item => item.sessionId === session.sessionId) || saved.get(session.sessionId);
    const environment = session.environments.find(env => env.id === session.selectedEnvironment);
    let endpointHost = ''; try { endpointHost = new URL(canonicalEndpoint(environment?.endpoint || '')).host; } catch {}
    const item: Activity = { sessionId: session.sessionId, name: session.name, environment: environment?.name || 'Not configured', endpointHost, production: environment?.production || false, status: 'Closed', editorId: '', connected: false, busy: false, readOnly: false, lastRun: previous?.lastRun || null, durationMs: previous?.durationMs || null, ...(previous?.lastOperation ? { lastOperation: previous.lastOperation } : {}), file: { workspaceId: event.workspaceId, path: event.path } };
    saved.set(session.sessionId, item);
    if (saved.size > 64) saved.delete(saved.keys().next().value!);
    for (const value of activity.values()) if (value.sessionId === session.sessionId) Object.assign(value, { file: item.file, name: session.name });
    changed(); await persistSaved();
  });
  function getApproval(id: string, editorId: string): Approval {
    const approval = approvals.get(id);
    if (!approval || approval.editorId !== editorId || Date.now() - approval.lastUsed > 30 * 60 * 1000) { approvals.delete(id); throw new RequestError('approval', 'Connection approval expired or the worker restarted. Click Connect again.'); }
    approval.lastUsed = Date.now(); return approval;
  }
  async function execute(input: ExecuteInput, context: PanelRequestContext) {
    const approval = getApproval(input.approvalId, context.panel.id);
    const kind = operationKind(input.operation);
    if (approval.environment.production && kind === 'mutation' && input.confirmedMutation !== true) throw new RequestError('production', 'Confirm this mutation before sending it to the production environment.');
    const headerValues = new Map<string, string>();
    for (const source of [approval.environment.headers, runtimeHeadersSchema.parse(input.headers || {}), approval.headers]) for (const [name, value] of Object.entries(source)) headerValues.set(name.toLowerCase(), value);
    const headers = Object.fromEntries(headerValues);
    const fingerprint = createHash('sha256').update(JSON.stringify(input.operation)).digest('hex');
    const key = context.panel.id + ':' + input.requestId;
    if (!input.requestId || input.requestId.length > 128 || requests.has(key) || [...requests.values()].some(v => v.editorId === context.panel.id && v.fingerprint === fingerprint)) throw new RequestError('limit', 'This operation is already running.');
    if (requests.size >= LIMITS.concurrent || [...requests.values()].filter(v => v.editorId === context.panel.id).length >= LIMITS.perEditor) throw new RequestError('limit', 'Too many concurrent requests. Wait for a request to finish.');
    const abort = new AbortController();
    requests.set(key, { id: input.requestId, editorId: context.panel.id, fingerprint, abort });
    update(context.panel.id, { busy: true, status: 'Running' });
    try {
      const response = await httpExecute(approval.environment.endpoint, input.operation, headers, approval.environment.timeoutMs, AbortSignal.any([context.signal, abort.signal]));
      const internal = input.operation.operationName === 'OrcaConnectionTest' || /query\s+IntrospectionQuery\b/.test(input.operation.query);
      update(context.panel.id, { connected: true, status: response.ok ? 'Connected' : 'GraphQL / HTTP error', ...(!internal ? { lastRun: Date.now(), durationMs: response.totalMs, lastOperation: { kind, name: (input.operation.operationName || 'Unnamed ' + kind).slice(0, 128) } } : {}) });
      return response;
    } finally { requests.delete(key); update(context.panel.id, { busy: [...requests.values()].some(v => v.editorId === context.panel.id) }); }
  }
  orca.panels.handle('connection.protection', () => outcome(async () => ({ secure: await secureAvailable(orca) })));
  orca.panels.handle('connection.approve', (input: ApprovalInput, context) => outcome(async (): Promise<Connection> => {
    if (!/^[0-9a-f-]{36}$/i.test(input.sessionId)) throw new RequestError('configuration', 'The session has no valid identifier.');
    const environment = environmentSchema.parse(input.environment);
    const previousAuth = environment.auth;
    environment.endpoint = canonicalEndpoint(environment.endpoint);
    if (isRemoteHttp(environment.endpoint) && input.allowInsecure !== true) throw new RequestError('approval', 'Remote HTTP is unencrypted. Confirm this endpoint explicitly before connecting.');
    forgetEditor(context.panel.id);
    for (const [id, value] of approvals) if (Date.now() - value.lastUsed > 30 * 60 * 1000) approvals.delete(id);
    if (approvals.size >= 128) throw new RequestError('limit', 'Too many open connections. Disconnect an unused session.');
    const credentials = await resolveCredentials(orca, environment, { endpoint: environment.endpoint, sessionId: input.sessionId, environmentId: environment.id }, input.credential);
    environment.auth = credentials.auth;
    const approval: Approval = { id: randomUUID(), editorId: context.panel.id, sessionId: input.sessionId, environment, headers: credentials.headers, lastUsed: Date.now() };
    approvals.set(approval.id, approval);
    update(context.panel.id, { status: 'Connecting' });
    try {
      const probe = await execute({ approvalId: approval.id, requestId: randomUUID(), operation: { query: 'query OrcaConnectionTest { __typename }', operationName: 'OrcaConnectionTest' }, confirmedMutation: false }, context);
      return { approvalId: approval.id, auth: credentials.auth, temporary: credentials.temporary, ...(probe.ok ? {} : { warning: 'Transport is reachable, but the connection probe returned GraphQL errors. Operations and introspection may still work.' }) };
    } catch (error) {
      approvals.delete(approval.id);
      if (input.credential?.persist && credentials.auth.type !== 'none' && (previousAuth.type === 'none' || previousAuth.secretId !== credentials.auth.secretId)) await orca.secrets.delete(credentials.auth.secretId).catch(() => {});
      update(context.panel.id, { status: error instanceof RequestError ? error.message : 'Connection failed', connected: false }); throw error;
    }
  }));
  orca.panels.handle('graphql.execute', (input, context) => outcome(async () => {
    try { return await execute(input, context); }
    catch (error) { update(context.panel.id, { status: error instanceof RequestError ? error.kind : 'Request failed', connected: !(error instanceof RequestError && ['approval', 'authentication'].includes(error.kind)) }); throw error; }
  }));
  orca.panels.handle('graphql.cancel', (input, { panel }) => { requests.get(panel.id + ':' + input.requestId)?.abort.abort(); return { ok: true as const }; });
  orca.panels.handle('connection.disconnect', (input, { panel }) => { if (approvals.get(input.approvalId)?.editorId === panel.id) forgetEditor(panel.id); return { ok: true as const }; });
  orca.panels.handle('credentials.delete', (input, { panel }) => outcome(async () => { const approval = getApproval(input.approvalId, panel.id); if (approval.environment.auth.type === 'none' || approval.environment.auth.secretId !== input.secretId) throw new RequestError('approval', 'The credential reference does not belong to this connection.'); await orca.secrets.delete(input.secretId); forgetEditor(panel.id); return { deleted: true as const }; }));
  orca.panels.handle('activity.register', async (input, { panel }) => {
    await initialized;
    if (input.name.length > 128 || input.environment.length > 128 || input.sessionId.length > 128) throw new RequestError('configuration', 'Invalid session activity metadata.');
    const prior = activity.get(panel.id);
    if (activity.size >= 64 && !prior) activity.delete(activity.keys().next().value!);
    const file = saved.get(input.sessionId)?.file;
    let endpointHost = ''; try { endpointHost = new URL(canonicalEndpoint(input.endpoint || '')).host; } catch {}
    activity.set(panel.id, { sessionId: input.sessionId, name: input.name, environment: input.environment, endpointHost, production: !!input.production, status: prior?.status || 'Disconnected', lastRun: prior?.lastRun || null, durationMs: prior?.durationMs || null, ...(prior?.lastOperation ? { lastOperation: prior.lastOperation } : {}), editorId: panel.id, connected: prior?.connected || false, busy: prior?.busy || false, readOnly: !!input.readOnly, ...(file ? { file } : {}) }); changed(); return { ok: true as const };
  });
  orca.panels.handle('activity.closed', (_input, { panel }) => {
    forgetEditor(panel.id);
    const item = activity.get(panel.id); activity.delete(panel.id);
    if (item?.file && !hidden.has(item.sessionId)) { saved.set(item.sessionId, { ...item, editorId: '', connected: false, busy: false, status: 'Closed' }); void persistSaved(); }
    changed(); return { ok: true as const };
  });
  orca.panels.handle('activity.list', async () => {
    await initialized;
    const stored = await orca.storage.get('activity');
    const current = [...activity.values()];
    const ids = new Set(current.map(v => v.sessionId));
    const recent = [...saved.values(), ...(Array.isArray(stored) ? stored.filter((item: any) => item && !saved.has(item.sessionId)) as unknown as Activity[] : [])];
    return [...current, ...recent.filter(item => !ids.has(item.sessionId))].slice(0, 64);
  });
  orca.panels.handle('activity.open', input => outcome(async () => {
    await initialized; if (!saved.get(input.sessionId)?.file) await refreshFiles();
    const file = saved.get(input.sessionId)?.file;
    if (!file) throw new RequestError('configuration', 'Save this session in Orca once to register its file in Explorer.');
    try { return await openSessionLocation(orca, file); } catch (cause) { if (cause instanceof RequestError) throw cause; throw hostFailure('open this session file', cause); }
  }));
  orca.panels.handle('activity.refresh', () => outcome(async () => { await refreshFiles(); return { refreshed: true as const }; }));
  orca.panels.handle('sessions.workspaces', () => outcome(async () => (await localWorkspaces(orca)).map(({ id, name }) => ({ id, name }))));
  orca.panels.handle('sessions.create', input => outcome(async () => {
    await initialized;
    const workspace = (await localWorkspaces(orca)).find(item => item.id === input.workspaceId);
    if (!workspace) throw new RequestError('configuration', 'Choose an available local workspace.');
    const { session, path } = await createSessionFile(workspace, input.filename);
    const item: Activity = { sessionId: session.sessionId!, name: session.name, environment: 'Not configured', status: 'Closed', lastRun: null, durationMs: null, editorId: '', connected: false, busy: false, readOnly: false, file: { workspaceId: workspace.id, path } };
    saved.set(item.sessionId, item); if (saved.size > 64) saved.delete(saved.keys().next().value!); await persistSaved(); changed();
    try { await openSessionLocation(orca, item.file!); return { created: true as const, opened: true }; }
    catch (cause) { return { created: true as const, opened: false, openError: hostFailure('open the new session', cause).message }; }
  }));
  orca.panels.handle('activity.remove', input => outcome(async () => {
    await initialized; saved.delete(input.sessionId);
    hidden.add(input.sessionId); if (hidden.size > 64) hidden.delete(hidden.values().next().value!); await orca.storage.set('hidden-sessions', [...hidden]);
    for (const [id, item] of activity) if (item.sessionId === input.sessionId) activity.delete(id);
    const recent = await orca.storage.get('activity');
    if (Array.isArray(recent)) await orca.storage.set('activity', recent.filter((item: any) => item?.sessionId !== input.sessionId));
    await persistSaved(); changed(); return { removed: true as const };
  }));
  orca.panels.handle('activity.rename', (input, context) => outcome(async () => {
    const item = activity.get(input.editorId);
    if (!item || item.readOnly) throw new RequestError('configuration', 'Open a writable session before renaming it.');
    const name = input.name.trim(); if (!name || name.length > 128) throw new RequestError('configuration', 'Use a session name between 1 and 128 characters.');
    if (renames.size >= 16) throw new RequestError('limit', 'Wait for the pending rename to finish.');
    const requestId = randomUUID();
    const renamed = await new Promise<boolean>(resolve => {
      const timer = setTimeout(() => done(false), 5000);
      const abort = () => done(false);
      const done = (ok: boolean) => { clearTimeout(timer); context.signal.removeEventListener('abort', abort); renames.delete(requestId); resolve(ok); };
      renames.set(requestId, { editorId: input.editorId, resolve: done });
      context.signal.addEventListener('abort', abort, { once: true });
      orca.panels.post('editor.rename', { requestId, name }, { panel: input.editorId });
    });
    if (!renamed) throw new RequestError('configuration', 'The session could not be renamed. It may have closed, become read-only, or have an edit conflict.');
    update(input.editorId, { name }); return { renamed: true as const };
  }));
  orca.panels.handle('activity.rename-result', (input, { panel }) => { const pending = renames.get(input.requestId); if (pending?.editorId === panel.id) pending.resolve(input.ok); return { ok: true as const }; });
  orca.panels.handle('activity.control', (input) => { if (input.action === 'cancel') cancelEditor(input.editorId); if (input.action === 'disconnect') forgetEditor(input.editorId); orca.panels.post('editor.control', { action: input.action }, { panel: input.editorId }); return { ok: true as const }; });
}
