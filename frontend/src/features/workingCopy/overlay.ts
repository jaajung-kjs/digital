export interface Overlay<T, P = Partial<T>> {
  creates: Record<string, T>;
  updates: Record<string, P>;
  deletes: string[];
  baseVersions: Record<string, string>;
}

export const emptyOverlay = <T, P = Partial<T>>(): Overlay<T, P> => ({
  creates: {}, updates: {}, deletes: [], baseVersions: {},
});

export function stageCreate<T, P>(o: Overlay<T, P>, tempId: string, item: T): Overlay<T, P> {
  return { ...o, creates: { ...o.creates, [tempId]: item } };
}

export function stageUpdate<T, P>(o: Overlay<T, P>, id: string, patch: P): Overlay<T, P> {
  return { ...o, updates: { ...o.updates, [id]: { ...(o.updates[id] ?? {}), ...patch } } };
}

export function stageDelete<T, P>(o: Overlay<T, P>, id: string, isTemp = false): Overlay<T, P> {
  const updates = { ...o.updates }; delete updates[id];
  if (isTemp) {
    const creates = { ...o.creates }; delete creates[id];
    return { ...o, creates, updates };
  }
  return { ...o, updates, deletes: o.deletes.includes(id) ? o.deletes : [...o.deletes, id] };
}

export function overlayDirtyCount<T, P>(o: Overlay<T, P>): number {
  return Object.keys(o.creates).length + Object.keys(o.updates).length + o.deletes.length;
}

export function snapshotBaseVersions<T>(
  saved: T[], idOf: (t: T) => string, versionOf: (t: T) => string | null,
): Record<string, string> {
  const bv: Record<string, string> = {};
  for (const s of saved) { const v = versionOf(s); if (v) bv[idOf(s)] = v; }
  return bv;
}
