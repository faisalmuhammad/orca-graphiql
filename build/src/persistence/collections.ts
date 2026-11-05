import type { Collection, CollectionsStorage } from '@graphiql/plugin-collections';
import { sessionSchema, type Session } from '../shared/session-schema';
import type { SessionController } from './session';
export function createCollectionsStorage(controller: SessionController, current: () => Session, changed: (session: Session) => void, error: (message: string) => void): CollectionsStorage {
  return {
    storageKey: 'orca-graphiql:' + controller.sessionId,
    async load() {
      const session = current();
      if (session.collections.length) return session.collections;
      return session.operations.length ? [{ id: 'session-operations', name: 'Session operations', createdAt: 0, updatedAt: 0, items: session.operations.map(({ id, name, query }) => ({ id, name, query, createdAt: 0, updatedAt: 0 })) }] : [];
    },
    async save(collections: Collection[]) {
      try {
        const clean = collections.map(({ items, ...collection }) => ({ ...collection, items: items.map(({ id, name, query, description, createdAt, updatedAt }) => ({ id, name, query, ...(description ? { description } : {}), createdAt, updatedAt })) }));
        const operations = clean.flatMap(collection => collection.items.map(({ id, name, query }) => ({ id, name, query })));
        const next = sessionSchema.parse({ ...current(), collections: clean, operations });
        controller.update(next); changed(next); await controller.flush();
      } catch (cause) { error('Unable to save the collection. Check read-only status, concurrent edits, and the 100-operation limit.'); throw cause; }
    },
  };
}
