import { useEffect, useRef } from 'react';
import { useEditorStore } from '../editor/stores/editorStore';
import { useSubstationWorkingCopy } from '../workingCopy/substationStore';

/**
 * 공유 선택(selectionStore.selectedAssetId) → 에디터 패널/뷰포트 단방향 반응.
 *
 * 선택 상태 자체는 selectionStore 단일 소스다(에디터는 그것을 직접 읽어
 * 하이라이트·드래그·삭제한다). 이 effect 는 선택을 재기록하지 않고, 공유 선택이
 * 현재 층에 있으면 상세 패널을 열고(revealDetail) viewport 를 그 자산으로 센터링
 * (bumpFocusTick)하는 부수효과만 담당한다 — 본부·사업소 평면도 진입(현황 선택→
 * 제자리 plan 전환) 흐름용. 선택을 다시 쓰지 않으므로 루프가 없다.
 *
 * UX#4 — 평면도 안에서의 단일 클릭(캔버스 selectAsset)은 상세 패널을 열지
 * 않는다(클릭=선택, 더블클릭=상세). 따라서 이 브리지는 "평면도 뷰로 진입하는 순간"
 * (active false→true 전이)에만 reveal 한다. 이미 활성인 상태에서 selectedAssetId 가
 * 바뀌는 것(=캔버스 단일 클릭)은 패널을 열지 않는다. 더블클릭은 캔버스 핸들러가
 * openDetail 을 직접 호출하므로 영향 없음.
 * - cross-floor 는 비대상 — 타 층 자산 진입은 gotoAsset(WorkspaceNavContext)이 그 층으로
 *   라우트 이동 후 ?assetId= 딥링크로 reveal+center 한다(이 브리지는 현재 층 한정).
 * @param active 배치도 뷰 활성(=에디터 마운트) 여부
 */
export function useEditorSelectionBridge(
  selectedAssetId: string | null,
  active: boolean,
) {
  const prevActive = useRef(false);
  useEffect(() => {
    const justEnteredPlan = active && !prevActive.current;
    prevActive.current = active;
    // 평면도 진입 전이일 때만 reveal — 이미 활성 중 selectedAssetId 변경(캔버스 단일
    // 클릭)은 무시해 패널을 열지 않는다.
    if (!justEnteredPlan || !selectedAssetId) return;
    const ed = useEditorStore.getState();
    // 현재 층 설비 존재 판정은 통합 working copy 의 effective asset 에서 한다.
    const present = useSubstationWorkingCopy.getState().effectiveAssets().some((a) => a.id === selectedAssetId);
    if (present) {
      ed.revealDetail(); // 상세 패널만 연다(선택 재기록 없음 → 루프 없음)
      ed.bumpFocusTick();
    }
  }, [active, selectedAssetId]);
}
