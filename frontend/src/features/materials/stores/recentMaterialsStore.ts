import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RecentMaterial {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  specParams: Record<string, unknown>;
  specification: string; // 표시용: "UTP CAT.6 4P"
  usedAt: number;
}

interface RecentMaterialsState {
  recentEquipment: RecentMaterial[];
  recentCables: RecentMaterial[];
  addRecent: (type: 'equipment' | 'cable', item: Omit<RecentMaterial, 'usedAt'>) => void;
}

const MAX_RECENT = 10;

export const useRecentMaterialsStore = create<RecentMaterialsState>()(
  persist(
    (set) => ({
      recentEquipment: [],
      recentCables: [],
      addRecent: (type, item) =>
        set((state) => {
          const key = type === 'equipment' ? 'recentEquipment' : 'recentCables';
          const existing = state[key];
          // 같은 specification 제거 후 앞에 추가
          const filtered = existing.filter((r) => r.specification !== item.specification);
          const updated = [{ ...item, usedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT);
          return { [key]: updated };
        }),
    }),
    { name: 'recent-materials' }
  )
);
