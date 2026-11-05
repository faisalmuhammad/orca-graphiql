import type { JsonValue } from './orca-api';
import type { Auth, Environment } from './session-schema';
export type FailureKind = 'configuration' | 'approval' | 'authentication' | 'network' | 'tls' | 'http' | 'graphql' | 'timeout' | 'cancelled' | 'limit' | 'unsupported' | 'secrets' | 'production';
export type Failure = { kind: FailureKind; message: string };
export type Outcome<T> = { ok: true; value: T } | { ok: false; error: Failure };
export type Operation = { query: string; variables?: Record<string, JsonValue>; operationName?: string | null; extensions?: Record<string, JsonValue> };
export type CredentialInput = { type: 'bearer' | 'api-key' | 'headers'; value: string; header?: string; persist: boolean };
export type ApprovalInput = { sessionId: string; environment: Environment; allowInsecure: boolean; credential?: CredentialInput };
export type Connection = { approvalId: string; auth: Auth; temporary: boolean; warning?: string };
export type ExecuteInput = { approvalId: string; requestId: string; operation: Operation; headers?: Record<string, string>; confirmedMutation: boolean };
export type WireResponse = { body: JsonValue; status: number; ok: boolean; totalMs: number; requestBytes: number; responseBytes: number };
export type Activity = { sessionId: string; name: string; environment: string; status: string; lastRun: number | null; durationMs: number | null; editorId: string; connected: boolean; busy: boolean; readOnly: boolean; endpointHost?: string; production?: boolean; lastOperation?: { kind: 'query' | 'mutation'; name: string }; file?: { workspaceId: string; path: string } };
// Orca accepts at most 64 KiB of JSON input. Leave room for its request envelope.
export const LIMITS = { requestBytes: 60 * 1024, responseBytes: 768 * 1024, concurrent: 8, perEditor: 2, history: 50, storageBytes: 512 * 1024 };
export const REQUEST_LIMIT_MESSAGE = 'Request exceeds the 60 KiB limit, including variables, extensions, headers, and connection settings. Reduce the request before trying again.';
export function requestTooLarge(value: unknown): boolean { return new TextEncoder().encode(JSON.stringify(value)).byteLength > LIMITS.requestBytes; }
export function plainJson<T>(value: T): JsonValue { return JSON.parse(JSON.stringify(value)); }
declare module 'orca' {
  interface PluginRequests {
    'connection.protection': { output: Outcome<{ secure: boolean }> };
    'connection.approve': { input: ApprovalInput; output: Outcome<Connection> };
    'connection.disconnect': { input: { approvalId: string }; output: { ok: true } };
    'graphql.execute': { input: ExecuteInput; output: Outcome<WireResponse> };
    'graphql.cancel': { input: { requestId: string }; output: { ok: true } };
    'credentials.delete': { input: { approvalId: string; secretId: string }; output: Outcome<{ deleted: true }> };
    'activity.register': { input: { sessionId: string; name: string; environment: string; readOnly?: boolean; endpoint?: string; production?: boolean }; output: { ok: true } };
    'activity.closed': { output: { ok: true } };
    'activity.list': { output: Activity[] };
    'activity.control': { input: { editorId: string; action: 'cancel' | 'disconnect' | 'refresh' }; output: { ok: true } };
    'activity.open': { input: { sessionId: string }; output: Outcome<{ opened: true }> };
    'activity.refresh': { output: Outcome<{ refreshed: true }> };
    'sessions.workspaces': { output: Outcome<{ id: string; name: string }[]> };
    'sessions.create': { input: { workspaceId: string; filename: string }; output: Outcome<{ created: true; opened: boolean; openError?: string }> };
    'activity.remove': { input: { sessionId: string }; output: Outcome<{ removed: true }> };
    'activity.rename': { input: { editorId: string; name: string }; output: Outcome<{ renamed: true }> };
    'activity.rename-result': { input: { requestId: string; ok: boolean }; output: { ok: true } };
  }
  interface PluginPanelEvents { 'activity.changed': { at: number }; 'editor.control': { action: 'cancel' | 'disconnect' | 'refresh' }; 'editor.rename': { requestId: string; name: string } }
}
