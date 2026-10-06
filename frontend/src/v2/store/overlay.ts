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

/**
 * 고치기를 싣는다. `base`(저장된 행)를 주면 **저장된 값으로 돌아온 칸은 걷는다** — 다 걷히면 그 행의
 * 고치기 자체를 지운다. 안 그러면 차단기를 하나 더했다 지운 것처럼 「제자리로 돌아온」 손질이
 * 변경 1건으로 남아, 아무것도 안 바뀌었는데 저장 바가 「저장할 것이 있다」고 말한다.
 * 비교는 원시값만(`Object.is`) — 객체 칸은 그대로 싣는다(틀려도 한 건 더 셀 뿐, 잃는 것은 없다).
 */
export function stageUpdate<T>(o: Overlay<T>, id: string, patch: Partial<T>, base?: T): Overlay<T> {
  if (o.creates[id]) return { ...o, creates: { ...o.creates, [id]: { ...o.creates[id], ...patch } } };
  const merged: Partial<T> = { ...o.updates[id], ...patch };
  if (base) {
    for (const k of Object.keys(merged) as (keyof T)[]) {
      const v = merged[k];
      if ((v === null || typeof v !== 'object') && Object.is(v, base[k])) delete merged[k];
    }
    if (Object.keys(merged).length === 0) {
      const updates = { ...o.updates };
      delete updates[id];
      return { ...o, updates };
    }
  }
  return { ...o, updates: { ...o.updates, [id]: merged } };
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
