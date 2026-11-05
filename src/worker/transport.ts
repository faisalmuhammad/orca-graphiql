import { getOperationAST, parse, visit } from 'graphql';
import type { JsonValue } from '../shared/orca-api';
import { LIMITS, REQUEST_LIMIT_MESSAGE, type Operation, type WireResponse } from '../shared/protocol';
import { runtimeHeadersSchema } from '../shared/session-schema';
import { RequestError } from './errors';
export function operationKind(operation: Operation): 'query' | 'mutation' {
  if (!operation || typeof operation.query !== 'string') throw new RequestError('configuration', 'The operation has no GraphQL query.');
  if (Buffer.byteLength(JSON.stringify(operation)) > LIMITS.requestBytes) throw new RequestError('limit', REQUEST_LIMIT_MESSAGE);
  let ast;
  try { ast = parse(operation.query); } catch { throw new RequestError('graphql', 'The operation is not valid GraphQL.'); }
  const selected = getOperationAST(ast, operation.operationName || undefined);
  if (!selected) throw new RequestError('graphql', 'Choose an operation name when the document contains multiple operations.');
  if (selected.operation === 'subscription') throw new RequestError('unsupported', 'Subscriptions are not supported in this release.');
  visit(ast, { Directive(node) { if (node.name.value === 'defer' || node.name.value === 'stream') throw new RequestError('unsupported', 'Incremental @defer and @stream responses are not supported in this release.'); } });
  return selected.operation;
}
function redact(value: JsonValue, secrets: string[]): JsonValue {
  if (typeof value === 'string') return secrets.reduce((text, secret) => secret ? text.split(secret).join('[redacted]') : text, value);
  if (Array.isArray(value)) return value.map(v => redact(v, secrets));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, redact(v, secrets)]));
  return value;
}
export async function httpExecute(endpoint: string, operation: Operation, headers: Record<string, string>, timeoutMs: number, parentSignal: AbortSignal): Promise<WireResponse> {
  runtimeHeadersSchema.parse(headers);
  const body = JSON.stringify(operation);
  const requestBytes = Buffer.byteLength(body);
  if (requestBytes > LIMITS.requestBytes) throw new RequestError('limit', REQUEST_LIMIT_MESSAGE);
  const timer = new AbortController();
  const timeout = setTimeout(() => timer.abort(), timeoutMs);
  const signal = AbortSignal.any([parentSignal, timer.signal]);
  const started = performance.now();
  try {
    const response = await fetch(endpoint, { method: 'POST', redirect: 'manual', headers: { ...headers, 'content-type': 'application/json', accept: 'application/graphql-response+json, application/json' }, body, signal });
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new RequestError('http', 'The endpoint redirected the request. Redirects are refused to protect credentials; configure the final endpoint explicitly.'); }
    if (response.status === 401 || response.status === 403) { await response.body?.cancel(); throw new RequestError('authentication', 'Authentication failed (HTTP ' + response.status + '). Check the selected credentials.'); }
    const type = response.headers.get('content-type') || '';
    if (!/application\/(graphql-response\+json|json)\b/i.test(type)) { await response.body?.cancel(); throw new RequestError('http', 'HTTP ' + response.status + ': expected a JSON GraphQL response. Multipart and streaming responses are not supported.'); }
    if (!response.body) throw new RequestError('http', 'The server returned an empty response.');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > LIMITS.responseBytes) { await reader.cancel(); throw new RequestError('limit', 'Response exceeds the 768 KiB transport limit. Add pagination or request fewer fields; no partial response was displayed.'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let result: JsonValue;
    try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new RequestError('http', 'HTTP ' + response.status + ': the server returned invalid JSON.'); }
    if (!result || typeof result !== 'object' || Array.isArray(result) || !('data' in result || 'errors' in result)) throw new RequestError('http', 'HTTP ' + response.status + ': the JSON body is not a GraphQL execution result.');
    if ('errors' in result) result.errors = redact(result.errors, Object.values(headers).flatMap(v => [v, v.replace(/^Bearer /i, '')]));
    const wire = { body: result, status: response.status, ok: response.ok && !('errors' in result && Array.isArray(result.errors) && result.errors.length), totalMs: Math.round(performance.now() - started), requestBytes, responseBytes: size };
    if (Buffer.byteLength(JSON.stringify(wire)) > LIMITS.responseBytes) throw new RequestError('limit', 'The processed response exceeds the 768 KiB transport limit. Request fewer fields; no partial response was displayed.');
    return wire;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    if (parentSignal.aborted) throw new RequestError('cancelled', 'Request cancelled.');
    if (timer.signal.aborted) throw new RequestError('timeout', 'Request exceeded the configured connection timeout.');
    const code = (error as { cause?: { code?: string } })?.cause?.code || '';
    if (/CERT|TLS|SSL|SELF_SIGNED|DEPTH_ZERO/.test(code)) throw new RequestError('tls', 'TLS verification failed. Check the endpoint certificate and trust chain.');
    throw new RequestError('network', 'Unable to reach the endpoint. Check its address, DNS, and network connection.');
  } finally { clearTimeout(timeout); }
}
