// Plugin-owned structural interfaces for the public APIs this plugin uses.
// Reference: https://github.com/stablyai/orca/blob/main/docs/reference/plugin-host-api.md
// These are compile-time contracts; no Orca implementation or SDK is bundled.
import type { PluginRequests, PluginPanelEvents } from 'orca';
export type JsonValue = null | boolean | number | string | JsonValue[] | { [field: string]: JsonValue };
export interface Disposable { dispose(): void }
export interface StorageApi {
  get(key: string): Promise<JsonValue | null>;
  set(key: string, value: JsonValue): Promise<void>;
  delete(key: string): Promise<void>;
}
export interface SecretsApi {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
type Input<K extends keyof PluginRequests> = PluginRequests[K] extends { input: infer Body } ? Body : undefined;
type Output<K extends keyof PluginRequests> = PluginRequests[K] extends { output: infer Body } ? Body : never;
type RequestOptions = { signal?: AbortSignal; timeoutMs?: number };
interface PluginBridge {
  request<K extends keyof PluginRequests>(name: K, ...arguments_: undefined extends Input<K> ? [input?: Input<K>, options?: RequestOptions] : [input: Input<K>, options?: RequestOptions]): Promise<Output<K>>;
  on<K extends keyof PluginPanelEvents>(event: K, listener: (message: PluginPanelEvents[K]) => unknown): Disposable;
}
export interface PanelRequestContext {
  panel: { id: string; surface: 'panel' | 'editor'; contributionId: string };
  signal: AbortSignal;
}
export interface OrcaWorkerApi {
  storage: StorageApi;
  secrets: SecretsApi;
  host: {
    call(method: 'secrets.protection'): Promise<{ status: 'os-keyring' | 'unavailable' }>;
    call(method: 'workspace.list'): Promise<{ workspaces: { id: string; name: string; path: string; hostId: string | null }[]; truncated: boolean }>;
    call(method: 'workspace.readContext'): Promise<{ displayName: string; branch: string } | null>;
    call(method: 'workspace.open', input: { workspaceId: string }): Promise<{ opened: true }>;
    call(method: 'editor.open', input: { workspaceId: string; path: string }): Promise<{ opened: true }>;
  };
  panels: {
    handle<K extends keyof PluginRequests>(method: K, handler: (input: Input<K>, context: PanelRequestContext) => Output<K> | Promise<Output<K>>): Disposable;
    post<K extends keyof PluginPanelEvents>(event: K, message: PluginPanelEvents[K], target?: { panel?: string }): void;
  };
  hooks: {
    on(event: 'editor.save.before', observer: (file: { workspaceId: string | null; path: string; text: string }) => void | Promise<void>): Disposable;
  };
}
type DocumentContent = { kind: 'text'; text: string } | { kind: 'bytes'; bytes: ArrayBuffer };
export interface EditorSession<T> {
  readonly value: T;
  readonly readOnly: boolean;
  change(value: T): void;
  flush(): Promise<void>;
  onReplace(listener: (value: T) => void): Disposable;
  dispose(): void;
}
export interface OrcaFrameApi {
  storage: StorageApi;
  plugin: PluginBridge;
  on(event: 'theme', listener: (theme: { colorScheme: 'light' | 'dark' }) => unknown): Disposable;
  on(event: 'editor.flush', listener: () => unknown): Disposable;
  document?: {
    session<T>(codec: {
      decode(content: DocumentContent): T;
      encode(value: T): DocumentContent;
      merge(base: T, external: T, local: T): T;
    }): Promise<EditorSession<T>>;
    onDidChange(listener: (file: { content: DocumentContent }) => void): Disposable;
  };
}
