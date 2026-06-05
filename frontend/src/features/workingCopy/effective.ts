import type { CollectionDescriptor } from './descriptor';
import type { Overlay } from './overlay';

/** saved + overlay → effective. 모든 컬렉션 공통(제네릭). */
export function mergeEffective<T, P>(
  saved: T[],
  overlay: Overlay<T, P>,
  d: CollectionDescriptor<T, P>,
): T[] {
  const deleted = new Set(overlay.deletes);
  const result: T[] = [];
  for (const s of saved) {
    const id = d.idOf(s);
    if (deleted.has(id)) continue;
    const patch = overlay.updates[id];
    result.push(patch ? ({ ...s, ...patch } as T) : s);
  }
  for (const id of Object.keys(overlay.creates)) result.push(overlay.creates[id]);
  return result;
}
