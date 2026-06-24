import { create } from 'zustand';
import { api } from '../../utils/api';
import type { AssetType } from '../../types/asset';
import type { AssetCategory } from '../../types/assetCategory';
import { emptyOverlay, stageCreate, stageUpdate, stageDelete, overlayDirtyCount, type Overlay } from '../workingCopy/overlay';
import { mergeEffective } from '../workingCopy/effective';
import { buildDelta } from '../workingCopy/delta';
import type { CollectionDescriptor } from '../workingCopy/descriptor';

/** 클라이언트 uuid v4 — 신규 분류/종류 id(같은 commit 의 FK 즉시 참조). secure-context 무관. */
export function newCatalogId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

type TypeP = Partial<Pick<AssetType, 'name' | 'categoryId'>>;
type CatP = Partial<Pick<AssetCategory, 'name' | 'sortOrder'>>;

// 카탈로그는 관리자 단일 편집 → OCC 미사용(versionOf null).
const typeDesc: CollectionDescriptor<AssetType> = { idOf: (t) => t.id, versionOf: () => null };
const catDesc: CollectionDescriptor<AssetCategory> = { idOf: (c) => c.id, versionOf: () => null };

interface CatalogState {
  baseTypes: AssetType[];
  baseCategories: AssetCategory[];
  typeOverlay: Overlay<AssetType, TypeP>;
  catOverlay: Overlay<AssetCategory, CatP>;
  load: () => Promise<void>;
  effectiveTypes: () => AssetType[];
  effectiveCategories: () => AssetCategory[];
  stageCreateType: (t: AssetType) => void;
  stageUpdateType: (id: string, p: TypeP) => void;
  stageDeleteType: (id: string, isNew: boolean) => void;
  stageCreateCategory: (c: AssetCategory) => void;
  stageUpdateCategory: (id: string, p: CatP) => void;
  stageDeleteCategory: (id: string, isNew: boolean) => void;
  dirtyCount: () => number;
  commit: () => Promise<void>;
  discard: () => void;
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  baseTypes: [],
  baseCategories: [],
  typeOverlay: emptyOverlay<AssetType, TypeP>(),
  catOverlay: emptyOverlay<AssetCategory, CatP>(),

  load: async () => {
    const [t, c] = await Promise.all([
      api.get<{ data: AssetType[] }>('/asset-types'),
      api.get<{ data: AssetCategory[] }>('/asset-categories'),
    ]);
    set({ baseTypes: t.data.data, baseCategories: c.data.data, typeOverlay: emptyOverlay(), catOverlay: emptyOverlay() });
  },

  effectiveTypes: () => mergeEffective(get().baseTypes, get().typeOverlay, typeDesc),
  effectiveCategories: () => mergeEffective(get().baseCategories, get().catOverlay, catDesc),

  stageCreateType: (t) => set((s) => ({ typeOverlay: stageCreate(s.typeOverlay, t.id, t) })),
  stageUpdateType: (id, p) => set((s) => ({ typeOverlay: stageUpdate(s.typeOverlay, id, p) })),
  stageDeleteType: (id, isNew) => set((s) => ({ typeOverlay: stageDelete(s.typeOverlay, id, isNew) })),
  stageCreateCategory: (c) => set((s) => ({ catOverlay: stageCreate(s.catOverlay, c.id, c) })),
  stageUpdateCategory: (id, p) => set((s) => ({ catOverlay: stageUpdate(s.catOverlay, id, p) })),
  stageDeleteCategory: (id, isNew) => set((s) => ({ catOverlay: stageDelete(s.catOverlay, id, isNew) })),

  dirtyCount: () => overlayDirtyCount(get().typeOverlay) + overlayDirtyCount(get().catOverlay),

  commit: async () => {
    const td = buildDelta(get().typeOverlay);
    const cd = buildDelta(get().catOverlay);
    await api.post('/catalog/commit', {
      assetCategories: {
        creates: cd.creates.map((c) => ({ id: c.id, name: c.name, sortOrder: c.sortOrder })),
        updates: cd.updates.map((u) => ({ id: u.id, patch: u.patch })),
        deletes: cd.deletes.map((d) => ({ id: d.id })),
      },
      assetTypes: {
        creates: td.creates.map((t) => ({ id: t.id, name: t.name, categoryId: t.categoryId ?? null })),
        updates: td.updates.map((u) => ({ id: u.id, patch: u.patch })),
        deletes: td.deletes.map((d) => ({ id: d.id })),
      },
    });
    await get().load();
  },

  discard: () => set({ typeOverlay: emptyOverlay(), catOverlay: emptyOverlay() }),
}));
