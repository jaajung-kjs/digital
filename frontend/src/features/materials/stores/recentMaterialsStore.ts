/**
 * P8 SHIM — DEPRECATED. Will be removed in P9.
 *
 * The "recent materials" feature is being retired (per user request before P8).
 * This file is kept only so existing call sites compile until P9 rewrites them.
 * The store is in-memory only (no `persist` middleware), addRecent is a no-op,
 * and the recent lists are always empty.
 */

import { create } from 'zustand';

export interface RecentMaterial {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  specParams: Record<string, unknown>;
  specification: string;
  usedAt: number;
}

interface RecentMaterialsState {
  recentEquipment: RecentMaterial[];
  recentCables: RecentMaterial[];
  addRecent: (
    type: 'equipment' | 'cable',
    item: Omit<RecentMaterial, 'usedAt'>,
  ) => void;
}

/** @deprecated P8 — removed in P9. */
export const useRecentMaterialsStore = create<RecentMaterialsState>(() => ({
  recentEquipment: [],
  recentCables: [],
  addRecent: () => {
    // no-op shim
  },
}));
