import type { Activity } from '../shared/protocol';
const list = document.getElementById('sessions')!;
const error = document.getElementById('error')!;
const dialog = document.getElementById('rename-dialog') as HTMLDialogElement;
const removeDialog = document.getElementById('remove-dialog') as HTMLDialogElement;
const renameInput = document.getElementById('session-name') as HTMLInputElement;
let selected: Activity | null = null;
let removing: Activity | null = null;
let inFlight = false;
let refreshPending = false;
let disposed = false;
async function refresh(discover = false) {
  if (disposed) return;
  if (inFlight) { refreshPending = true; return; }
  inFlight = true;
  const refreshButton = document.getElementById('refresh') as HTMLButtonElement;
  refreshButton.disabled = true; refreshButton.dataset.loading = 'true'; list.setAttribute('aria-busy', 'true');
  try {
    if (discover) { const result = await orca.plugin.request('activity.refresh'); if (!result.ok) throw new Error(result.error.message); }
    const sessions = await orca.plugin.request('activity.list');
    if (disposed) return;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusedSession = active?.closest<HTMLElement>('[data-session-id]')?.dataset.sessionId;
    const focusedAction = active?.dataset.action;
    list.replaceChildren();
    renderSummary(sessions);
    if (!sessions.length) renderEmpty();
    for (const item of sessions) render(item);
    if (focusedSession && focusedAction) {
      const card = [...list.querySelectorAll<HTMLElement>('[data-session-id]')].find(node => node.dataset.sessionId === focusedSession);
      const target = [...card?.querySelectorAll<HTMLElement>('[data-action]') || []].find(node => node.dataset.action === focusedAction && !node.matches(':disabled'))
        || card?.querySelector<HTMLElement>('.session-link') || list.querySelector<HTMLElement>('.session-link') || document.getElementById('new-session');
      target?.focus({ preventScroll: true });
    }
    error.textContent = '';
  } catch {
    error.textContent = 'Unable to read session activity. Try Refresh.';
    if (document.getElementById('session-count')!.textContent === '—') { const state = document.getElementById('summary-state')!; state.textContent = 'Unavailable'; state.dataset.state = 'error'; }
  }
  finally {
    inFlight = false; refreshButton.disabled = false; refreshButton.dataset.loading = 'false'; list.setAttribute('aria-busy', 'false');
    if (refreshPending && !disposed) { refreshPending = false; void refresh(); }
  }
}
function renderSummary(sessions: Activity[]) {
  const connected = sessions.filter(item => item.connected).length;
  const running = sessions.filter(item => item.busy).length;
  document.getElementById('session-count')!.textContent = String(sessions.length);
  document.getElementById('session-count-label')!.textContent = sessions.length === 1 ? 'session' : 'sessions';
  document.getElementById('connected-count')!.textContent = String(connected);
  document.getElementById('running-count')!.textContent = String(running);
  document.querySelector('.section-heading > span')!.textContent = sessions.length ? 'Click to open' : 'Get started';
  const state = document.getElementById('summary-state')!;
  state.dataset.state = running ? 'running' : connected ? 'connected' : 'idle';
  state.textContent = running ? 'Requests running' : connected ? 'Connected' : 'Ready to connect';
}
function renderEmpty() {
  const empty = document.createElement('div'); empty.className = 'empty-state';
  const logo = document.createElement('img'); logo.src = '../images/icon.png'; logo.alt = ''; logo.width = 32; logo.height = 32;
  const heading = document.createElement('h3'); heading.textContent = 'Create a GraphiQL session';
  const text = document.createElement('p'); text.textContent = 'Create a session, add an endpoint, and explore your GraphQL API.';
  const create = document.createElement('button'); create.className = 'primary-button'; create.textContent = 'Create session';
  create.addEventListener('click', () => document.getElementById('new-session')!.click());
  empty.append(logo, heading, text, create); list.append(empty);
}
async function open(item: Activity) {
  error.textContent = '';
  try { const result = await orca.plugin.request('activity.open', { sessionId: item.sessionId }); if (!result.ok) throw new Error(result.error.message); error.textContent = ''; }
  catch (cause) { error.textContent = cause instanceof Error ? cause.message : 'Unable to open this session. Its file may have moved.'; }
}
function icon(path: string) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '15'); svg.setAttribute('height', '15'); svg.setAttribute('aria-hidden', 'true');
  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path'); shape.setAttribute('d', path); shape.setAttribute('fill', 'none'); shape.setAttribute('stroke', 'currentColor'); shape.setAttribute('stroke-width', '1.7'); shape.setAttribute('stroke-linecap', 'round'); shape.setAttribute('stroke-linejoin', 'round'); svg.append(shape); return svg;
}
function iconButton(label: string, path: string) {
  const button = document.createElement('button'); button.className = 'icon-button'; button.title = label; button.setAttribute('aria-label', label); button.append(icon(path)); return button;
}
const statusLabels: Record<string, string> = { configuration: 'Configuration error', approval: 'Reconnect required', authentication: 'Authentication failed', network: 'Network error', tls: 'TLS error', http: 'HTTP error', graphql: 'GraphQL error', timeout: 'Timed out', limit: 'Request too large', unsupported: 'Unsupported operation', secrets: 'Credentials unavailable', production: 'Confirmation required', cancelled: 'Cancelled' };
function render(item: Activity) {
  const state = item.busy ? 'running' : /cancelled/i.test(item.status) ? 'idle' : (statusLabels[item.status] || /error|failed|exceeded|refused/i.test(item.status)) ? 'error' : item.connected ? 'connected' : 'idle';
  const card = document.createElement('article'); card.className = 'session-card'; card.dataset.sessionId = item.sessionId; card.dataset.state = state;
  card.addEventListener('click', event => { if (event.target instanceof Element && !event.target.closest('button')) void open(item); });
  const header = document.createElement('div'); header.className = 'item-header';
  const heading = document.createElement('h3');
  const name = document.createElement('button'); name.className = 'session-link'; name.dataset.action = 'open'; name.textContent = item.name || 'Untitled session';
  name.title = item.file ? 'Open ' + item.file.path : 'Locate and open this session';
  name.addEventListener('click', () => open(item)); heading.append(name);
  const environment = document.createElement('div'); environment.className = 'environment-row';
  const environmentName = document.createElement('span'); environmentName.className = 'environment-name'; environmentName.textContent = item.environment; environment.append(environmentName);
  for (const [visible, label, className] of [[item.production, 'Production', 'production-badge'], [item.readOnly, 'Read-only', '']] as const) {
    if (!visible) continue;
    const badge = document.createElement('span'); badge.className = 'badge ' + className; badge.textContent = label; environment.append(badge);
  }
  const statusRow = document.createElement('div'); statusRow.className = 'status-row';
  const status = document.createElement('span'); status.className = 'status-badge'; status.dataset.state = state; status.title = item.status;
  const dot = document.createElement('i'); dot.className = 'dot'; dot.setAttribute('aria-hidden', 'true');
  status.append(dot, item.busy ? 'Running' : statusLabels[item.status] || item.status || (item.connected ? 'Connected' : 'Disconnected'));
  statusRow.append(status);
  if (item.lastRun && item.durationMs !== null) { const duration = document.createElement('span'); duration.className = 'duration'; duration.textContent = item.durationMs + ' ms'; duration.title = 'Duration of last operation'; statusRow.append(duration); }
  const footer = document.createElement('div'); footer.className = 'card-footer';
  const last = document.createElement('span'); last.className = 'last-run';
  const date = item.lastRun ? new Date(item.lastRun) : null;
  last.textContent = date ? 'Last run ' + (date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString([], { month: 'short', day: 'numeric' })) : 'No runs yet';
  if (date) last.title = date.toLocaleString();
  const fileState = document.createElement('span'); fileState.className = 'file-state'; fileState.textContent = item.editorId ? 'Open' : 'Closed'; footer.append(last, fileState);
  const actions = document.createElement('div'); actions.className = 'actions';
  const rename = iconButton('Rename session', 'M4 20l4-1L20 7l-3-3L5 16z M14 7l3 3'); rename.disabled = !item.editorId || item.readOnly;
  rename.dataset.action = 'rename';
  rename.title = item.readOnly ? 'This session is read-only' : !item.editorId ? 'Open the session to rename it' : 'Rename session';
  rename.addEventListener('click', () => { selected = item; renameInput.value = item.name; dialog.showModal(); renameInput.focus(); renameInput.select(); });
  const remove = iconButton('Remove from Explorer (keep file)', 'M6 6l12 12 M18 6L6 18');
  remove.classList.add('remove-button'); remove.dataset.action = 'remove';
  remove.addEventListener('click', () => {
    removing = item; document.getElementById('remove-name')!.textContent = item.name || 'Untitled session'; removeDialog.showModal();
  });
  const itemActions = document.createElement('div'); itemActions.className = 'item-actions'; itemActions.append(rename, remove); header.append(heading, itemActions);
  for (const [action, label] of [['cancel', 'Cancel request'], ['disconnect', 'Disconnect'], ['refresh', 'Refresh schema']] as const) {
    if (action === 'cancel' ? !item.busy : !item.connected) continue;
    const button = document.createElement('button'); button.textContent = label; button.disabled = !item.editorId || (action === 'cancel' ? !item.busy : !item.connected);
    button.dataset.action = action; if (action === 'cancel') button.className = 'cancel-button';
    button.addEventListener('click', async () => { button.disabled = true; try { await orca.plugin.request('activity.control', { editorId: item.editorId, action }); await refresh(); } catch { error.textContent = 'Unable to control this session. It may have closed.'; } });
    actions.append(button);
  }
  const endpoint = document.createElement('p'); endpoint.className = 'endpoint'; endpoint.title = item.endpointHost || 'Endpoint not configured';
  const host = document.createElement('code'); host.textContent = item.endpointHost || 'Endpoint not configured'; endpoint.append(icon('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M3 12h18 M12 3c-5 5-5 13 0 18 M12 3c5 5 5 13 0 18'), host);
  card.append(header, environment, endpoint, statusRow);
  if (item.lastOperation) {
    const operation = document.createElement('div'); operation.className = 'operation-row';
    const kind = document.createElement('span'); kind.className = 'operation-kind'; kind.dataset.kind = item.lastOperation.kind; kind.textContent = item.lastOperation.kind.toUpperCase();
    const operationName = document.createElement('span'); operationName.className = 'operation-name'; operationName.textContent = item.lastOperation.name; operationName.title = item.lastOperation.name; operation.append(kind, operationName); card.append(operation);
  }
  card.append(footer); if (actions.childElementCount) card.append(actions); list.append(card);
}
document.getElementById('rename-form')!.addEventListener('submit', async event => {
  event.preventDefault(); const item = selected; if (!item) return;
  const button = document.getElementById('rename-submit') as HTMLButtonElement; button.disabled = true;
  try { const result = await orca.plugin.request('activity.rename', { editorId: item.editorId, name: renameInput.value }); if (!result.ok) throw new Error(result.error.message); dialog.close(); await refresh(); }
  catch (cause) { document.getElementById('rename-error')!.textContent = cause instanceof Error ? cause.message : 'Unable to rename the session.'; }
  finally { button.disabled = false; }
});
dialog.addEventListener('close', () => { selected = null; document.getElementById('rename-error')!.textContent = ''; });
document.getElementById('rename-cancel')!.addEventListener('click', () => dialog.close());
document.getElementById('remove-cancel')!.addEventListener('click', () => removeDialog.close());
removeDialog.addEventListener('close', () => { removing = null; document.getElementById('remove-error')!.textContent = ''; });
document.getElementById('remove-confirm')!.addEventListener('click', async () => {
  const item = removing; if (!item) return;
  const button = document.getElementById('remove-confirm') as HTMLButtonElement; button.disabled = true;
  try { const result = await orca.plugin.request('activity.remove', { sessionId: item.sessionId }); if (!result.ok) throw new Error(result.error.message); removeDialog.close(); await refresh(); }
  catch { document.getElementById('remove-error')!.textContent = 'Unable to remove this Explorer entry. Try again.'; }
  finally { button.disabled = false; }
});
document.getElementById('refresh')!.addEventListener('click', () => refresh(true));
document.getElementById('new-session')!.addEventListener('click', async () => {
  const button = document.getElementById('new-session') as HTMLButtonElement; button.disabled = true;
  try {
    const result = await orca.plugin.request('sessions.workspaces'); if (!result.ok) throw new Error(result.error.message);
    const select = document.getElementById('create-workspace') as HTMLSelectElement; select.replaceChildren();
    const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Choose workspace'; select.append(placeholder);
    for (const workspace of result.value) { const option = document.createElement('option'); option.value = workspace.id; option.textContent = workspace.name; select.append(option); }
    if (result.value.length === 1) select.value = result.value[0].id;
    if (!result.value.length) throw new Error('Open a local folder or worktree workspace in Orca first.');
    (document.getElementById('create-dialog') as HTMLDialogElement).showModal();
  } catch (cause) { error.textContent = cause instanceof Error ? cause.message : 'Unable to create the session.'; }
  finally { button.disabled = false; }
});
const createDialog = document.getElementById('create-dialog') as HTMLDialogElement;
document.getElementById('create-cancel')!.addEventListener('click', () => createDialog.close());
createDialog.addEventListener('close', () => { document.getElementById('create-error')!.textContent = ''; });
document.getElementById('create-form')!.addEventListener('submit', async event => {
  event.preventDefault(); const button = document.getElementById('create-submit') as HTMLButtonElement; button.disabled = true;
  try {
    const result = await orca.plugin.request('sessions.create', { workspaceId: (document.getElementById('create-workspace') as HTMLSelectElement).value, filename: (document.getElementById('create-filename') as HTMLInputElement).value });
    if (!result.ok) throw new Error(result.error.message);
    createDialog.close(); await refresh();
    document.getElementById('creation-status')!.textContent = result.value.opened ? '' : 'Session created. ' + (result.value.openError || 'Click its Explorer entry to open it.');
  } catch (cause) { document.getElementById('create-error')!.textContent = cause instanceof Error ? cause.message : 'Unable to create the session.'; }
  finally { button.disabled = false; }
});
const subscription = orca.plugin.on('activity.changed', () => refresh());
window.addEventListener('pagehide', () => { disposed = true; subscription.dispose(); });
void refresh(true);
