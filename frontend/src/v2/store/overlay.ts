export interface Overlay<T> {
  creates: Record<string, T>;
  updates: Record<string, Partial<T>>;
  deletes: string[];
}

export function emptyOverlay<T>(): Overlay<T> {
  return { creates: {}, updates: {}, deletes: [] };
}

export function stageCreate<T>(o: Overlay<T>, id: string, item: T): Overlay<T> {
  return { ...o, creates: { ...o.creates, [id]: item } };
}

export function stageUpdate<T>(o: Overlay<T>, id: string, patch: Partial<T>): Overlay<T> {
  if (o.creates[id]) return { ...o, creates: { ...o.creates, [id]: { ...o.creates[id], ...patch } } };
  return { ...o, updates: { ...o.updates, [id]: { ...o.updates[id], ...patch } } };
}

export function stageDelete<T>(o: Overlay<T>, id: string): Overlay<T> {
  if (o.creates[id]) {
    const creates = { ...o.creates };
    delete creates[id];
    return { ...o, creates };
  }
  const updates = { ...o.updates };
  delete updates[id];
  return { creates: o.creates, updates, deletes: o.deletes.includes(id) ? o.deletes : [...o.deletes, id] };
}

export function overlayDirtyCount<T>(o: Overlay<T>): number {
  return Object.keys(o.creates).length + Object.keys(o.updates).length + o.deletes.length;
}

export function mergeEffective<T extends { id: string }>(saved: T[], o: Overlay<T>): T[] {
  const deleted = new Set(o.deletes);
  const merged = saved.filter((s) => !deleted.has(s.id)).map((s) => (o.updates[s.id] ? { ...s, ...o.updates[s.id] } : s));
  return [...merged, ...Object.values(o.creates)];
}
