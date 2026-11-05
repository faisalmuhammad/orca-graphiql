import { randomUUID } from 'node:crypto';
import type { OrcaWorkerApi } from '../shared/orca-api';
import type { Auth, Environment } from '../shared/session-schema';
import { runtimeHeadersSchema } from '../shared/session-schema';
import type { CredentialInput } from '../shared/protocol';
import { RequestError } from './errors';
type Binding = { endpoint: string; sessionId: string; environmentId: string };
type Stored = Binding & { headers: Record<string, string> };
export async function secureAvailable(orca: OrcaWorkerApi): Promise<boolean> {
  try { return (await orca.host.call('secrets.protection')).status === 'os-keyring'; } catch { return false; }
}
export async function resolveCredentials(orca: OrcaWorkerApi, environment: Environment, binding: Binding, input?: CredentialInput): Promise<{ headers: Record<string, string>; auth: Auth; temporary: boolean }> {
  if (!input) {
    if (environment.auth.type === 'none') return { headers: {}, auth: environment.auth, temporary: false };
    if (!await secureAvailable(orca)) throw new RequestError('secrets', 'Secure storage is unavailable. Enter explicitly temporary credentials for this connection.');
    const secret = await orca.secrets.get(environment.auth.secretId);
    if (!secret) throw new RequestError('authentication', 'Saved credentials are unavailable. Enter them again in Connection settings.');
    let stored: Stored;
    try { stored = JSON.parse(secret); } catch { throw new RequestError('secrets', 'Stored credentials could not be decoded. Enter them again.'); }
    if (stored.endpoint !== binding.endpoint || stored.sessionId !== binding.sessionId || stored.environmentId !== binding.environmentId) throw new RequestError('approval', 'These credentials belong to another endpoint or session. Enter credentials for this environment.');
    return { headers: runtimeHeadersSchema.parse(stored.headers), auth: environment.auth, temporary: false };
  }
  if (!input.value || input.value.length > 32768) throw new RequestError('configuration', 'Enter credentials within the 32 KiB limit.');
  let headers: Record<string, string>;
  if (input.type === 'bearer') headers = { Authorization: 'Bearer ' + input.value };
  else if (input.type === 'api-key') headers = { [input.header || 'X-API-Key']: input.value };
  else {
    try { headers = JSON.parse(input.value); } catch { throw new RequestError('configuration', 'Authentication headers must be a JSON object.'); }
  }
  headers = runtimeHeadersSchema.parse(headers);
  if (!input.persist) return { headers, auth: { type: 'none' }, temporary: true };
  if (!await secureAvailable(orca)) throw new RequestError('secrets', 'Secure secret storage is unavailable. Choose temporary credentials explicitly.');
  const secretId = 'credential-' + randomUUID();
  await orca.secrets.set(secretId, JSON.stringify({ ...binding, headers } satisfies Stored));
  const auth: Auth = input.type === 'api-key' ? { type: 'api-key', header: input.header || 'X-API-Key', secretId } : { type: input.type, secretId };
  return { headers, auth, temporary: false };
}
