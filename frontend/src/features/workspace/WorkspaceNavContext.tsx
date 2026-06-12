import { createContext, useContext } from 'react';

export interface WorkspaceNav {
  /** 도면 탭으로 전환 + 층 선택(+선택 장비). */
  gotoFloor: (floorId: string, assetId?: string) => void;
  /**
   * 자산이 어디에 있든(타 층·타 변전소) 그 자산을 도면에서 드러낸다 — 단일 진입점.
   *
   * 자산의 floor anchor(floorAnchor)로 소속 층·변전소를 해소해 공유 선택을 세팅하고
   * 그 변전소의 평면도로 이동(필요 시 라우트 전환)한다. cross-floor·cross-substation 모두
   * 한 경로로 처리된다. 로컬 working copy 에 없는 cross-substation 타깃은 `floorId` 힌트로
   * 층→변전소 리다이렉트 셸(/floors/:id/plan)을 거쳐 같은 ?assetId= 포커스로 수렴한다.
   *
   * @param assetId 드러낼 자산
   * @param hint    로컬에서 해소 불가한 타깃의 위치 힌트(예: OFD 대국 — floorId 만 알 때)
   */
  gotoAsset: (assetId: string, hint?: { floorId: string }) => void;
}

export const WorkspaceNavContext = createContext<WorkspaceNav | null>(null);

/** 워크스페이스 내비 컨텍스트 소비 — Provider(WorkspacePage) 밖이면 null. */
export function useWorkspaceNav(): WorkspaceNav | null {
  return useContext(WorkspaceNavContext);
}
