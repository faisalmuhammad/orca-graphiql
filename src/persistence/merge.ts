import type { Session } from '../shared/session-schema';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export class SessionConflict extends Error { constructor() { super('The session changed outside this editor. Review the external version and your draft.'); } }
function merge(base: any, outside: any, mine: any): any {
  if (same(mine, base) || same(mine, outside)) return outside;
  if (same(outside, base)) return mine;
  if ([base, outside, mine].every(v => v && typeof v === 'object' && !Array.isArray(v))) {
    const output: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(outside), ...Object.keys(mine)])) {
      const next = merge(base[key], outside[key], mine[key]);
      if (next !== undefined) output[key] = next;
    }
    return output;
  }
  if ([base, outside, mine].every(Array.isArray) && [...base, ...outside, ...mine].every(v => v && typeof v.id === 'string')) {
    const maps = [base, outside, mine].map(items => new Map(items.map((v: any) => [v.id, v])));
    return [...new Set([...outside, ...mine].map(v => v.id))].flatMap(id => {
      const next = merge(maps[0].get(id), maps[1].get(id), maps[2].get(id));
      return next === undefined ? [] : [next];
    });
  }
  throw new SessionConflict();
}
export function mergeSessions(base: Session, outside: Session, mine: Session): Session { return merge(base, outside, mine); }
