export interface AssetSearchResult {
  id: string;
  name: string;
  substationId: string;
  substationName: string | null;
}

export interface AssetSearchParams {
  role?: string;
  q?: string;
  substationId?: string;
}

export interface AssetSearchCreate {
  id: string;
  name: string;
  role: string | null;
  substationId: string;
  substationName: string | null;
}

/** 검색용 overlay(staged delta). creates 는 필터 재평가용 role 보유, updates 는 표시 필드만. */
export interface AssetSearchOverlay {
  creates: AssetSearchCreate[];
  updates: { id: string; name?: string; substationName?: string }[];
  deletes: string[];
}

export function matchesSearch(
  row: { name: string; substationId: string; role: string | null },
  params: AssetSearchParams,
): boolean {
  if (params.role && row.role !== params.role) return false;
  if (params.q && !row.name.toLowerCase().includes(params.q.toLowerCase())) return false;
  if (params.substationId && row.substationId !== params.substationId) return false;
  return true;
}

/**
 * committed(이미 Prisma 필터됨) ⊕ overlay 머지. deletes 제거 → updates 표시필드 패치(present row 만)
 * → filter 일치 creates 추가(중복 제외). updates 는 멤버십 변경 안 함(role 재타입 등은 P3-1 비범위).
 */
export function mergeSearchOverlay(
  committed: AssetSearchResult[],
  overlay: AssetSearchOverlay | undefined,
  params: AssetSearchParams,
): AssetSearchResult[] {
  if (!overlay) return committed;
  const deleted = new Set(overlay.deletes);
  const byId = new Map<string, AssetSearchResult>();
  for (const r of committed) if (!deleted.has(r.id)) byId.set(r.id, r);

  for (const u of overlay.updates) {
    const ex = byId.get(u.id);
    if (!ex) continue;
    byId.set(u.id, {
      ...ex,
      ...(u.name !== undefined ? { name: u.name } : {}),
      ...(u.substationName !== undefined ? { substationName: u.substationName } : {}),
    });
  }

  for (const c of overlay.creates) {
    if (deleted.has(c.id) || byId.has(c.id)) continue;
    if (!matchesSearch(c, params)) continue;
    byId.set(c.id, { id: c.id, name: c.name, substationId: c.substationId, substationName: c.substationName });
  }

  return [...byId.values()];
}
