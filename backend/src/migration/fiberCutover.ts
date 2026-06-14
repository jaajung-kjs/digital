interface OutCable { id: string; specParams: unknown }
interface FiberPathRow { id: string }

/** 커오버 계획: 마이그레이션 OUT 의 __fromCableId 옛 광케이블 + 전 FiberPath 삭제. 순수. */
export function planFiberCutover(migratedOut: OutCable[], fiberPaths: FiberPathRow[]): { oldCableIds: string[]; fiberPathIds: string[] } {
  const oldCableIds = new Set<string>();
  for (const c of migratedOut) {
    const sp = (c.specParams ?? {}) as Record<string, unknown>;
    if (sp.__migration === 'fiberToSlots' && typeof sp.__fromCableId === 'string') oldCableIds.add(sp.__fromCableId);
  }
  return { oldCableIds: [...oldCableIds], fiberPathIds: fiberPaths.map((f) => f.id) };
}
