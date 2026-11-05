import React, { useEffect, useMemo } from 'react';
import { useGraphiQL } from '@graphiql/react';
import { GraphiQL, DEFAULT_PLUGINS } from 'graphiql';
import { collectionsPlugin, COLLECTIONS_PLUGIN, type CollectionsStorage } from '@graphiql/plugin-collections';
import type { GraphQLSchema } from 'graphql';
import type { Transport } from '@graphiql/toolkit';
import type { SessionStorage } from '../persistence/storage';
import type { Session } from '../shared/session-schema';
import { LIMITS } from '../shared/protocol';
function SystemEditorFonts() {
  const queryEditor = useGraphiQL(state => state.queryEditor);
  const variableEditor = useGraphiQL(state => state.variableEditor);
  const headerEditor = useGraphiQL(state => state.headerEditor);
  const responseEditor = useGraphiQL(state => state.responseEditor);
  useEffect(() => {
    // Update Monaco's measured font metrics as well as GraphiQL's CSS fonts.
    for (const editor of [queryEditor, variableEditor, headerEditor, responseEditor]) {
      editor?.updateOptions({ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' });
    }
  }, [queryEditor, variableEditor, headerEditor, responseEditor]);
  return null;
}
export function GraphiQLView({ transport, schema, storage, collections, readOnly, session, query, variables, theme, onQuery, onVariables, onSchema }: { transport: Transport; schema: GraphQLSchema | null | undefined; storage: SessionStorage; collections: CollectionsStorage; readOnly: boolean; session: Session; query?: string; variables?: string; theme: 'light' | 'dark'; onQuery: (query: string) => void; onVariables: (variables: string) => void; onSchema: (schema: GraphQLSchema) => void }) {
  const plugins = useMemo(() => DEFAULT_PLUGINS.map(plugin => plugin === COLLECTIONS_PLUGIN ? collectionsPlugin({ storage: collections, readOnly, allowImportExport: false }) : plugin), [collections, readOnly]);
  function expandTools(event: React.MouseEvent | React.KeyboardEvent) {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('.graphiql-var-headers-strip-bar input[type="radio"]')) return;
    if (event.type === 'keydown' && !['Enter', ' '].includes((event as React.KeyboardEvent).key)) return;
    // Invoke the upstream expand control; the upstream tab handles selection itself.
    event.currentTarget.querySelector<HTMLButtonElement>('.graphiql-toggle-editor-tools[aria-label="Show editor tools"]')?.click();
  }
  return <div className="native-graphiql" onClick={expandTools} onKeyDown={expandTools}><GraphiQL transport={transport} plugins={plugins} schema={schema} storage={storage.storage} defaultQuery="" initialQuery={query} initialVariables={variables} initialHeaders="" defaultTabs={session.operations.length ? session.operations.map(op => ({ query: op.query, variables: op.variables })) : [{ query: '' }]} forcedTheme={theme} shouldPersistHeaders={false} showPersistHeadersSettings={false} maxHistoryLength={LIMITS.history} onEditQuery={onQuery} onEditVariables={onVariables} onSchemaChange={onSchema}><SystemEditorFonts /></GraphiQL></div>;
}
