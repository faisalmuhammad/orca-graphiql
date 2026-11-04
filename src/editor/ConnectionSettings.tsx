import React, { useState } from 'react';
import { Modal } from './Modal';
import { canonicalEndpoint, environmentSchema, type Environment } from '../shared/session-schema';
import type { CredentialInput } from '../shared/protocol';
export function ConnectionSettings({ environment, session, secure, readOnly, onApply, onClose, onRemove }: { environment: Environment | null; session: { name: string; persistHistory: boolean }; secure: boolean; readOnly: boolean; onApply: (env: Environment, credential: CredentialInput | undefined, metadata: { name: string; persistHistory: boolean }) => void; onClose: () => void; onRemove: () => void }) {
  const [sessionName, setSessionName] = useState(session.name);
  const [persistHistory, setPersistHistory] = useState(session.persistHistory);
  const [name, setName] = useState(environment?.name || 'New environment');
  const [endpoint, setEndpoint] = useState(environment?.endpoint || '');
  const [headers, setHeaders] = useState(JSON.stringify(environment?.headers || {}, null, 2));
  const [production, setProduction] = useState(environment?.production || false);
  const [timeout, setTimeout] = useState((environment?.timeoutMs || 20000) / 1000);
  const [authType, setAuthType] = useState<CredentialInput['type'] | 'none'>(environment?.auth.type || 'none');
  const [credential, setCredential] = useState('');
  const [header, setHeader] = useState(environment?.auth.type === 'api-key' ? environment.auth.header : 'X-API-Key');
  const [persist, setPersist] = useState(false);
  const [error, setError] = useState('');
  function apply(event: React.FormEvent) {
    event.preventDefault();
    try {
      const url = canonicalEndpoint(endpoint);
      const existing = environment?.endpoint === url && environment.auth.type === authType ? environment.auth : { type: 'none' as const };
      const env = environmentSchema.parse({ id: environment?.id || crypto.randomUUID(), name, endpoint: url, headers: JSON.parse(headers), production, timeoutMs: timeout * 1000, auth: existing, ...(environment?.subscriptionUrl ? { subscriptionUrl: environment.subscriptionUrl } : {}) });
      if (authType !== 'none' && !credential && existing.type === 'none') throw new Error('Enter credentials, or choose No authentication.');
      onApply(env, authType !== 'none' && credential ? { type: authType, value: credential, ...(authType === 'api-key' ? { header } : {}), persist: persist && secure && !readOnly } : undefined, { name: sessionName, persistHistory });
      setCredential('');
    } catch (error) { setError(error instanceof Error && !('issues' in error) ? error.message : 'Invalid environment. Use a valid URL, 1–90 second timeout, and non-sensitive JSON headers.'); }
  }
  return <Modal title="Connection settings" onClose={() => { setCredential(''); onClose(); }}><form onSubmit={apply}>
    {error && <p role="alert">{error}</p>}
    <div className="fields"><label>Session name<input value={sessionName} onChange={e => setSessionName(e.target.value)} maxLength={128} disabled={readOnly} /></label><label className="check"><input type="checkbox" checked={persistHistory} onChange={e => setPersistHistory(e.target.checked)} disabled={readOnly} />Keep local query history</label><label>Environment name<input value={name} onChange={e => setName(e.target.value)} maxLength={128} disabled={readOnly} required /></label>
    <label>GraphQL HTTP endpoint<input type="url" value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="https://api.example.com/graphql" disabled={readOnly} required /></label>
    <label>Timeout (seconds)<input type="number" min={1} max={90} value={timeout} onChange={e => setTimeout(Number(e.target.value))} disabled={readOnly} /></label>
    <label className="check"><input type="checkbox" checked={production} onChange={e => setProduction(e.target.checked)} disabled={readOnly} />Production environment — confirm mutations</label>
    <label>Non-sensitive headers<textarea value={headers} onChange={e => setHeaders(e.target.value)} spellCheck={false} rows={4} disabled={readOnly} /></label>
    <p className="muted">Authorization, tokens, API keys and cookies belong in authentication settings below.</p>
    <label>Authentication<select value={authType} onChange={e => { setAuthType(e.target.value as typeof authType); setCredential(''); }}><option value="none">No authentication</option><option value="bearer">Bearer token</option><option value="api-key">API key</option><option value="headers">Secret HTTP headers</option></select></label>
    {authType === 'api-key' && <label>API key header<input value={header} onChange={e => setHeader(e.target.value)} /></label>}
    {authType !== 'none' && <><label>{authType === 'headers' ? 'Secret headers (JSON object)' : environment?.auth.type === authType ? 'Replace credential (leave empty to keep saved)' : 'Credential'}{authType === 'headers' ? <textarea value={credential} onChange={e => setCredential(e.target.value)} rows={3} autoComplete="off" spellCheck={false} /> : <input type="password" value={credential} onChange={e => setCredential(e.target.value)} autoComplete="off" maxLength={32768} />}</label>
    <label className="check"><input type="checkbox" checked={persist} onChange={e => setPersist(e.target.checked)} disabled={!secure || readOnly} />Store securely in Orca secrets</label>
    <p className="muted">{secure ? 'Unchecked credentials are temporary and must be entered again after disconnect or worker restart.' : 'Secure storage is unavailable. Only explicitly temporary credentials can be used.'}</p></>}
    </div><div className="dialog-actions">{environment && !readOnly && <button type="button" className="danger" onClick={onRemove}>Remove environment</button>}<button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit">{readOnly ? 'Use temporary credentials' : 'Apply'}</button></div>
  </form></Modal>;
}
