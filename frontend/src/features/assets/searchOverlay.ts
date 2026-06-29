import type { AssetsOverlay } from '../workingCopy/substationStore';

export interface SearchOverlay {
  creates: { id: string; name: string; role: string | null; substationId: string; substationName: string | null }[];
  updates: { id: string; name?: string; substationName?: string | null }[];
  deletes: string[];
}

/** 워킹카피 자산 overlay → 검색 request overlay. orgNames: substationId → 변전소명. */
export function buildSearchOverlay(assets: AssetsOverlay, orgNames: Map<string, string>): SearchOverlay {
  const creates = Object.values(assets.creates).map((a) => ({
    id: a.id,
    name: a.name,
    role: a.assetType?.role ?? null,
    substationId: a.substationId,
    substationName: orgNames.get(a.substationId) ?? null,
  }));
  const updates = Object.entries(assets.updates)
    .filter(([id]) => !Object.prototype.hasOwnProperty.call(assets.creates, id))
    .map(([id, p]) => {
      const patch: { id: string; name?: string; substationName?: string | null } = { id };
      if (p.name !== undefined) patch.name = p.name;
      if (p.substationId !== undefined) patch.substationName = orgNames.get(p.substationId) ?? null;
      return patch;
    });
  return { creates, updates, deletes: [...assets.deletes] };
}

/** 순서 안정 해시(React Query 키용). 빈 overlay → ''. */
export function hashSearchOverlay(o: SearchOverlay): string {
  if (!o.creates.length && !o.updates.length && !o.deletes.length) return '';
  const creates = [...o.creates].sort((a, b) => a.id.localeCompare(b.id));
  const updates = [...o.updates].sort((a, b) => a.id.localeCompare(b.id));
  const deletes = [...o.deletes].sort();
  return JSON.stringify({ creates, updates, deletes });
}
