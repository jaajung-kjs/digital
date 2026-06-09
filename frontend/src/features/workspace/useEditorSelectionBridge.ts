import { useEffect, useRef } from 'react';
import { useEditorStore } from '../editor/stores/editorStore';

/**
 * 공유 선택 ↔ 에디터(전역 store) 양방향 동기화. 에디터는 무수정.
 * - 에디터 → 공유: detailPanelEquipmentId 변화 관찰 → setSelectedAssetId
 * - 공유 → 에디터: selectedAssetId 가 현재 층에 있으면 선택+센터 (same-floor only)
 * - cross-floor 는 비대상(표의 "도면에서 보기"=gotoFloor 가 처리)
 * @param active 배치도 뷰 활성(=에디터 마운트) 여부
 */
export function useEditorSelectionBridge(
  selectedAssetId: string | null,
  setSelectedAssetId: (id: string | null) => void,
  active: boolean,
) {
  const selRef = useRef(selectedAssetId);
  selRef.current = selectedAssetId;
  const prevEditorId = useRef<string | null>(null);

  // 에디터 → 공유 (관찰). subscribeWithSelector 불필요: 전체 구독 후 필드 비교.
  useEffect(() => {
    if (!active) return;
    prevEditorId.current = useEditorStore.getState().detailPanelEquipmentId;
    const unsub = useEditorStore.subscribe((s) => {
      const id = s.detailPanelEquipmentId;
      if (id === prevEditorId.current) return;
      prevEditorId.current = id;
      if (id && id !== selRef.current) setSelectedAssetId(id);
    });
    return unsub;
  }, [active, setSelectedAssetId]);

  // 공유 → 에디터 (구동, same-floor)
  useEffect(() => {
    if (!active || !selectedAssetId) return;
    const ed = useEditorStore.getState();
    if (ed.detailPanelEquipmentId === selectedAssetId) return; // 루프 가드
    if (ed.localEquipment.find((e) => e.id === selectedAssetId)) {
      ed.setSelectedIds([selectedAssetId]);
      ed.setDetailPanelEquipmentId(selectedAssetId);
      ed.bumpFocusTick();
    }
  }, [active, selectedAssetId]);
}
