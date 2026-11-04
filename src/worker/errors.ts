import type { FailureKind, Outcome } from '../shared/protocol';
export class RequestError extends Error { constructor(public kind: FailureKind, message: string) { super(message); } }
export async function outcome<T>(work: () => T | Promise<T>): Promise<Outcome<T>> {
  try { return { ok: true, value: await work() }; }
  catch (error) { return { ok: false, error: error instanceof RequestError ? { kind: error.kind, message: error.message } : { kind: 'configuration', message: 'Invalid request or configuration. Check the endpoint, headers, and session format.' } }; }
}
