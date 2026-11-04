import { getOperationAST, parse } from 'graphql';
import type { Transport, TransportRequest, TransportResponse } from '@graphiql/toolkit';
import type { OrcaFrameApi } from '../shared/orca-api';
import { plainJson, type ExecuteInput, type Failure } from '../shared/protocol';
import type { Environment } from '../shared/session-schema';
export function createWorkerTransport(host: OrcaFrameApi, environment: Environment | null, approvalId: string | null, controls: { confirmMutation: (operation: string) => Promise<boolean>; status: (status: string) => void; failure: (failure: Failure) => void }) {
  const pending = new Map<string, AbortController>();
  let disposed = false;
  const transport: Transport = {
    url: environment?.endpoint || '', method: 'POST', supportedMethods: ['POST'],
    async send(request: TransportRequest): Promise<TransportResponse> {
      if (disposed || !environment || !approvalId) throw new Error('Click Connect to approve this endpoint before executing.');
      const id = crypto.randomUUID();
      let confirmedMutation = false;
      let ast;
      try { ast = parse(request.query); } catch { throw new Error('The operation is not valid GraphQL.'); }
      const operation = getOperationAST(ast, request.operationName || undefined);
      if (environment.production && operation?.operation === 'mutation') {
        confirmedMutation = await controls.confirmMutation(operation.name?.value || 'Unnamed mutation');
        if (!confirmedMutation || disposed) throw new Error('Production mutation cancelled.');
      }
      const abort = new AbortController();
      pending.set(id, abort);
      const onAbort = () => abort.abort();
      request.signal?.addEventListener('abort', onAbort, { once: true });
      if (request.signal?.aborted) abort.abort();
      const payload = plainJson({ approvalId, requestId: id, operation: { query: request.query, variables: request.variables, operationName: request.operationName, extensions: request.extensions }, headers: request.headers, confirmedMutation }) as ExecuteInput;
      controls.status('Running');
      try {
        const result = await host.plugin.request('graphql.execute', payload, { signal: abort.signal, timeoutMs: environment.timeoutMs + 5000 });
        if (disposed || abort.signal.aborted) throw new Error('Request cancelled after changing the environment.');
        if (!result.ok) { controls.failure(result.error); throw new Error(result.error.message); }
        const wire = result.value;
        controls.status(wire.ok ? 'Connected' : 'GraphQL / HTTP error');
        return { body: wire.body as TransportResponse['body'], status: wire.status, ok: wire.ok, method: 'POST', timing: { totalMs: wire.totalMs }, size: { request: wire.requestBytes, response: wire.responseBytes } };
      } catch (error) {
        if (!disposed && abort.signal.aborted) controls.status('Cancelled');
        throw error;
      } finally { pending.delete(id); request.signal?.removeEventListener('abort', onAbort); }
    },
  };
  return { transport, cancel() { for (const [id, controller] of pending) { controller.abort(); void host.plugin.request('graphql.cancel', { requestId: id }).catch(() => {}); } }, dispose() { disposed = true; for (const controller of pending.values()) controller.abort(); pending.clear(); } };
}
