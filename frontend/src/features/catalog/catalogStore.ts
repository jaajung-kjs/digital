import { create } from 'zustand';
import { api } from '../../utils/api';
import type { AssetType } from '../../types/asset';
import type { AssetCategory } from '../../types/assetCategory';
import type { CableGroup } from '../../types/cableGroup';
import type { CableCategory } from '../../types/cableCategory';
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

type TypeP = Partial<Pick<AssetType, 'name' | 'categoryId' | 'laborType' | 'installHoursPerUnit' | 'removeHoursPerUnit' | 'relocateHoursPerUnit'>>;
type CatP = Partial<Pick<AssetCategory, 'name' | 'sortOrder'>>;
type CgP = Partial<Pick<CableGroup, 'name' | 'color' | 'sortOrder' | 'laborType' | 'installHoursPerMeter' | 'removeHoursPerMeter' | 'relocateHoursPerMeter'>>;
type CcP = Partial<Pick<CableCategory, 'name' | 'groupId'>>;

// 카탈로그는 관리자 단일 편집 → OCC 미사용(versionOf null).
const typeDesc: CollectionDescriptor<AssetType> = { idOf: (t) => t.id, versionOf: () => null };
const catDesc: CollectionDescriptor<AssetCategory> = { idOf: (c) => c.id, versionOf: () => null };
const cgDesc: CollectionDescriptor<CableGroup> = { idOf: (g) => g.id, versionOf: () => null };
const ccDesc: CollectionDescriptor<CableCategory> = { idOf: (c) => c.id, versionOf: () => null };

interface CatalogState {
  baseTypes: AssetType[];
  baseCategories: AssetCategory[];
  baseCableGroups: CableGroup[];
  baseCableCategories: CableCategory[];
  typeOverlay: Overlay<AssetType, TypeP>;
  catOverlay: Overlay<AssetCategory, CatP>;
  cgOverlay: Overlay<CableGroup, CgP>;
  ccOverlay: Overlay<CableCategory, CcP>;
  load: () => Promise<void>;
  effectiveTypes: () => AssetType[];
  effectiveCategories: () => AssetCategory[];
  effectiveCableGroups: () => CableGroup[];
  effectiveCableCategories: () => CableCategory[];
  stageCreateType: (t: AssetType) => void;
  stageUpdateType: (id: string, p: TypeP) => void;
  stageDeleteType: (id: string, isNew: boolean) => void;
  stageCreateCategory: (c: AssetCategory) => void;
  stageUpdateCategory: (id: string, p: CatP) => void;
  stageDeleteCategory: (id: string, isNew: boolean) => void;
  stageCreateCableGroup: (g: CableGroup) => void;
  stageUpdateCableGroup: (id: string, p: CgP) => void;
  stageDeleteCableGroup: (id: string, isNew: boolean) => void;
  stageCreateCableCategory: (c: CableCategory) => void;
  stageUpdateCableCategory: (id: string, p: CcP) => void;
  stageDeleteCableCategory: (id: string, isNew: boolean) => void;
  dirtyCount: () => number;
  commit: () => Promise<void>;
  discard: () => void;
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  baseTypes: [],
  baseCategories: [],
  baseCableGroups: [],
  baseCableCategories: [],
  typeOverlay: emptyOverlay<AssetType, TypeP>(),
  catOverlay: emptyOverlay<AssetCategory, CatP>(),
  cgOverlay: emptyOverlay<CableGroup, CgP>(),
  ccOverlay: emptyOverlay<CableCategory, CcP>(),

  load: async () => {
    const [t, c, cg, cc] = await Promise.all([
      api.get<{ data: AssetType[] }>('/asset-types'),
      api.get<{ data: AssetCategory[] }>('/asset-categories'),
      api.get<{ data: CableGroup[] }>('/cable-groups'),
      api.get<{ data: CableCategory[] }>('/cable-categories'),
    ]);
    set({
      baseTypes: t.data.data, baseCategories: c.data.data,
      baseCableGroups: cg.data.data, baseCableCategories: cc.data.data,
      typeOverlay: emptyOverlay(), catOverlay: emptyOverlay(), cgOverlay: emptyOverlay(), ccOverlay: emptyOverlay(),
    });
  },

  effectiveTypes: () => mergeEffective(get().baseTypes, get().typeOverlay, typeDesc),
  effectiveCategories: () => mergeEffective(get().baseCategories, get().catOverlay, catDesc),
  effectiveCableGroups: () => mergeEffective(get().baseCableGroups, get().cgOverlay, cgDesc),
  effectiveCableCategories: () => mergeEffective(get().baseCableCategories, get().ccOverlay, ccDesc),

  stageCreateType: (t) => set((s) => ({ typeOverlay: stageCreate(s.typeOverlay, t.id, t) })),
  stageUpdateType: (id, p) => set((s) => ({ typeOverlay: stageUpdate(s.typeOverlay, id, p) })),
  stageDeleteType: (id, isNew) => set((s) => ({ typeOverlay: stageDelete(s.typeOverlay, id, isNew) })),
  stageCreateCategory: (c) => set((s) => ({ catOverlay: stageCreate(s.catOverlay, c.id, c) })),
  stageUpdateCategory: (id, p) => set((s) => ({ catOverlay: stageUpdate(s.catOverlay, id, p) })),
  stageDeleteCategory: (id, isNew) => set((s) => ({ catOverlay: stageDelete(s.catOverlay, id, isNew) })),
  stageCreateCableGroup: (g) => set((s) => ({ cgOverlay: stageCreate(s.cgOverlay, g.id, g) })),
  stageUpdateCableGroup: (id, p) => set((s) => ({ cgOverlay: stageUpdate(s.cgOverlay, id, p) })),
  stageDeleteCableGroup: (id, isNew) => set((s) => ({ cgOverlay: stageDelete(s.cgOverlay, id, isNew) })),
  stageCreateCableCategory: (c) => set((s) => ({ ccOverlay: stageCreate(s.ccOverlay, c.id, c) })),
  stageUpdateCableCategory: (id, p) => set((s) => ({ ccOverlay: stageUpdate(s.ccOverlay, id, p) })),
  stageDeleteCableCategory: (id, isNew) => set((s) => ({ ccOverlay: stageDelete(s.ccOverlay, id, isNew) })),

  dirtyCount: () =>
    overlayDirtyCount(get().typeOverlay) + overlayDirtyCount(get().catOverlay) +
    overlayDirtyCount(get().cgOverlay) + overlayDirtyCount(get().ccOverlay),

  commit: async () => {
    const td = buildDelta(get().typeOverlay);
    const cd = buildDelta(get().catOverlay);
    const cgd = buildDelta(get().cgOverlay);
    const ccd = buildDelta(get().ccOverlay);
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
      cableGroups: {
        creates: cgd.creates.map((g) => ({ id: g.id, name: g.name, color: g.color })),
        updates: cgd.updates.map((u) => ({ id: u.id, patch: u.patch })),
        deletes: cgd.deletes.map((d) => ({ id: d.id })),
      },
      cableCategories: {
        creates: ccd.creates.map((c) => ({ id: c.id, name: c.name, groupId: c.groupId })),
        updates: ccd.updates.map((u) => ({ id: u.id, patch: u.patch })),
        deletes: ccd.deletes.map((d) => ({ id: d.id })),
      },
    });
    await get().load();
  },

  discard: () => set({ typeOverlay: emptyOverlay(), catOverlay: emptyOverlay(), cgOverlay: emptyOverlay(), ccOverlay: emptyOverlay() }),
}));
