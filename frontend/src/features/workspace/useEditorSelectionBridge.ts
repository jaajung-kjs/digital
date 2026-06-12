import { useEffect } from 'react';
import { useEditorStore } from '../editor/stores/editorStore';
import { useSubstationWorkingCopy } from '../workingCopy/substationStore';

/**
 * 공유 선택 → 에디터 단방향 동기화. 에디터는 무수정.
 * openDetail 이 공유 선택(selectionStore)에 직접 쓰므로 에디터→공유 방향은
 * 더 이상 필요 없다(단일 소스). 여기서는 공유 선택이 현재 층에 있으면 에디터
 * 상세 패널을 열고(센터) — 선택을 다시 쓰지 않아(revealDetail) 루프가 없다.
 * - cross-floor 는 비대상(표의 "도면에서 보기"=gotoFloor 가 처리)
 * @param active 배치도 뷰 활성(=에디터 마운트) 여부
 */
export function useEditorSelectionBridge(
  selectedAssetId: string | null,
  active: boolean,
) {
  // 공유 → 에디터 (구동, same-floor)
  useEffect(() => {
    if (!active || !selectedAssetId) return;
    const ed = useEditorStore.getState();
    // SSOT-2d-3b: editorStore.localEquipment 제거 — 현재 층 설비 존재 판정은
    // 통합 working copy 의 effective asset 에서 한다.
    const present = useSubstationWorkingCopy.getState().effectiveAssets().some((a) => a.id === selectedAssetId);
    if (present) {
      ed.setSelectedIds([selectedAssetId]);
      ed.revealDetail(); // 상세 패널만 연다(선택 재기록 없음 → 루프 없음)
      ed.bumpFocusTick();
    }
  }, [active, selectedAssetId]);
}
