import { createContext, useContext } from 'react';

export interface Selection {
  selectedAssetId: string | null;
  setSelectedAssetId: (id: string | null) => void;
}

export const SelectionContext = createContext<Selection | null>(null);

/** 워크스페이스 밖이면 null. */
export const useSelection = (): Selection | null => useContext(SelectionContext);
