import { useEffect } from 'react';
import { useEditorStore } from '../editor/stores/editorStore';
import { useSubstationWorkingCopy } from '../workingCopy/substationStore';

/**
 * 공유 선택(selectionStore.selectedAssetId) → 에디터 패널/뷰포트 단방향 반응.
 *
 * 선택 상태 자체는 selectionStore 단일 소스다(에디터는 그것을 직접 읽어
 * 하이라이트·드래그·삭제한다). 이 effect 는 선택을 재기록하지 않고, 공유 선택이
 * 현재 층에 있으면 상세 패널을 열고(revealDetail) viewport 를 그 자산으로 센터링
 * (bumpFocusTick)하는 부수효과만 담당한다 — 현황표 행 클릭 → 도면 진입 흐름용.
 * 선택을 다시 쓰지 않으므로 루프가 없다.
 * - cross-floor 는 비대상(표의 "도면에서 보기"=gotoFloor 가 처리)
 * @param active 배치도 뷰 활성(=에디터 마운트) 여부
 */
export function useEditorSelectionBridge(
  selectedAssetId: string | null,
  active: boolean,
) {
  useEffect(() => {
    if (!active || !selectedAssetId) return;
    const ed = useEditorStore.getState();
    // 현재 층 설비 존재 판정은 통합 working copy 의 effective asset 에서 한다.
    const present = useSubstationWorkingCopy.getState().effectiveAssets().some((a) => a.id === selectedAssetId);
    if (present) {
      ed.revealDetail(); // 상세 패널만 연다(선택 재기록 없음 → 루프 없음)
      ed.bumpFocusTick();
    }
  }, [active, selectedAssetId]);
}
