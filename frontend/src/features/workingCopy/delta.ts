import type { Overlay } from './overlay';

export interface CollectionDelta<T, P> {
  creates: T[];
  updates: { id: string; baseVersion: string | null; patch: P }[];
  deletes: { id: string; baseVersion: string | null }[];
}

export function buildDelta<T, P>(o: Overlay<T, P>): CollectionDelta<T, P> {
  const createdIds = new Set(Object.keys(o.creates));
  return {
    // tempId 가 creates+updates 둘 다 있으면(place 후 drag), 패치를 create 에 합쳐 한 번만 보낸다.
    creates: Object.keys(o.creates).map((id) => {
      const patch = o.updates[id];
      return patch ? ({ ...o.creates[id], ...patch } as T) : o.creates[id];
    }),
    // 아직 저장 안 된 created tempId 의 update 는 redundant → 제외(백엔드 update where:{id:tempId} P2025 방지).
    updates: Object.entries(o.updates)
      .filter(([id]) => !createdIds.has(id))
      .map(([id, patch]) => ({ id, baseVersion: o.baseVersions[id] ?? null, patch })),
    deletes: o.deletes.map((id) => ({ id, baseVersion: o.baseVersions[id] ?? null })),
  };
}
