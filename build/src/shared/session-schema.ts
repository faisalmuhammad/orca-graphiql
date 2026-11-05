import { z } from 'zod';
// Isolated editor frames prohibit dynamic evaluation. Use Zod's supported interpreter.
z.config({ jitless: true });
export const sensitiveHeader = /authorization|cookie|token|api[-_]?key|secret|password/i;
export const reservedHeader = /^(host|connection|content-length|transfer-encoding|content-type|accept|proxy-authorization|upgrade|trailer)$/i;
const headerName = z.string().regex(/^[!#$%&'*+.^_\x60|~0-9A-Za-z-]+$/).max(128);
export const runtimeHeadersSchema = z.record(headerName, z.string().max(8192).refine(v => !/[\r\n]/.test(v), 'Header values cannot contain line breaks')).refine(v => Object.keys(v).length <= 32 && !Object.keys(v).some(k => reservedHeader.test(k)), 'Too many headers or a reserved transport header');
const fileHeaders = runtimeHeadersSchema.refine(v => !Object.keys(v).some(k => sensitiveHeader.test(k)), 'Sensitive headers belong in secure authentication settings');
const identity = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const authSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('none') }),
  z.strictObject({ type: z.literal('bearer'), secretId: identity }),
  z.strictObject({ type: z.literal('api-key'), secretId: identity, header: headerName }),
  z.strictObject({ type: z.literal('headers'), secretId: identity }),
]);
export const environmentSchema = z.strictObject({
  id: identity, name: z.string().min(1).max(128), endpoint: z.string().max(2048), subscriptionUrl: z.string().max(2048).optional(),
  headers: fileHeaders.default({}), auth: authSchema.default({ type: 'none' }),
  production: z.boolean().default(false), timeoutMs: z.number().int().min(1000).max(90000).default(20000),
});
const operationSchema = z.strictObject({ id: identity, name: z.string().min(1).max(128), query: z.string().max(262144), variables: z.string().max(131072).optional() });
const collectionItemSchema = z.strictObject({ id: identity, name: z.string().min(1).max(128), query: z.string().max(262144), description: z.string().max(2048).optional(), createdAt: z.number(), updatedAt: z.number() });
const collectionSchema = z.strictObject({ id: identity, name: z.string().min(1).max(128), description: z.string().max(2048).optional(), createdAt: z.number(), updatedAt: z.number(), items: z.array(collectionItemSchema).max(100) });
export const sessionSchema = z.strictObject({
  schemaVersion: z.literal(1), sessionId: z.string().uuid().optional(), name: z.string().max(128),
  environments: z.array(environmentSchema).max(32), selectedEnvironment: identity.nullable(), operations: z.array(operationSchema).max(100),
  collections: z.array(collectionSchema).max(20).default([]),
  preferences: z.strictObject({ persistHistory: z.boolean() }).default({ persistHistory: true }),
}).superRefine((value, ctx) => {
  for (const field of ['environments', 'operations'] as const) {
    if (new Set(value[field].map(item => item.id)).size !== value[field].length) ctx.addIssue({ code: 'custom', path: [field], message: 'Identifiers must be unique' });
  }
  if (value.selectedEnvironment !== null && !value.environments.some(env => env.id === value.selectedEnvironment)) ctx.addIssue({ code: 'custom', path: ['selectedEnvironment'], message: 'Selected environment does not exist' });
});
export type Session = z.infer<typeof sessionSchema>;
export type Environment = z.infer<typeof environmentSchema>;
export type Auth = z.infer<typeof authSchema>;
export const MAX_SESSION_BYTES = 768 * 1024;
function withinSessionLimit(text: string) {
  if (new TextEncoder().encode(text).byteLength > MAX_SESSION_BYTES) throw new Error('The GraphiQL session exceeds its 768 KiB document limit. Reduce saved operations or collections.');
  return text;
}
export function parseSession(text: string): Session {
  withinSessionLimit(text);
  let input: unknown;
  try { input = JSON.parse(text); } catch { throw new Error('This is not valid JSON. Open Source to repair the GraphiQL session.'); }
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error('Invalid GraphiQL session (' + (issue.path.join('.') || 'document') + '): ' + issue.message + '. Expected schemaVersion 1.');
  }
  return parsed.data;
}
export function serializeSession(value: Session): string { return withinSessionLimit(JSON.stringify(sessionSchema.parse(value), null, 2) + '\n'); }
export function canonicalEndpoint(endpoint: string): string {
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new Error('Enter a valid GraphQL HTTP(S) endpoint.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) throw new Error('Use HTTP(S) without URL credentials, query parameters, or fragments.');
  return url.href;
}
export function isRemoteHttp(endpoint: string): boolean {
  const url = new URL(canonicalEndpoint(endpoint));
  return url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}
