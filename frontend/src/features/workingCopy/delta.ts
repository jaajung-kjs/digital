import type { Overlay } from './overlay';

export interface CollectionDelta<T, P> {
  creates: T[];
  updates: { id: string; baseVersion: string | null; patch: P }[];
  deletes: { id: string; baseVersion: string | null }[];
}

export function buildDelta<T, P>(o: Overlay<T, P>): CollectionDelta<T, P> {
  return {
    creates: Object.values(o.creates),
    updates: Object.entries(o.updates).map(([id, patch]) => ({
      id, baseVersion: o.baseVersions[id] ?? null, patch,
    })),
    deletes: o.deletes.map((id) => ({ id, baseVersion: o.baseVersions[id] ?? null })),
  };
}
