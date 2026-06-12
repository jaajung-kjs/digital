import { createContext } from 'react';

export interface WorkspaceNav {
  /** 도면 탭으로 전환 + 층 선택(+선택 장비). */
  gotoFloor: (floorId: string, assetId?: string) => void;
  /** 현황 탭으로 전환(+선택 자산). */
  gotoRegister: (assetId?: string) => void;
}

export const WorkspaceNavContext = createContext<WorkspaceNav | null>(null);
