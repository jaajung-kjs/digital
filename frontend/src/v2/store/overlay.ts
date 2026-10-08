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
 * 비교는 얕게(`sameValue`) — 원시값은 `Object.is`, 작은 객체(연결 끝 `{ kind, equipmentId, label }`)는 칸마다.
 * 그래서 포트 표기를 고쳤다 되돌려도 걷힌다. 깊은 객체(경로 점 배열)는 같아도 다르다고 볼 수 있다 —
 * 그때는 한 건 더 셀 뿐, 잃는 것은 없다.
 */
/** 얕은 같음 — 객체는 칸마다(없는 칸과 null 은 같다: 연결 끝의 `label` 은 없을 수도, null 일 수도 있다), 배열은 원소마다. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  }
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].every((k) => Object.is(x[k] ?? null, y[k] ?? null));
}

export function stageUpdate<T>(o: Overlay<T>, id: string, patch: Partial<T>, base?: T): Overlay<T> {
  if (o.creates[id]) return { ...o, creates: { ...o.creates, [id]: { ...o.creates[id], ...patch } } };
  const merged: Partial<T> = { ...o.updates[id], ...patch };
  if (base) {
    for (const k of Object.keys(merged) as (keyof T)[]) {
      if (sameValue(merged[k], base[k])) delete merged[k];
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
