import { useEditorStore, useSelectedEquipment } from '../stores/editorStore';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { AssetResizeHandles } from './AssetResizeHandles';

/**
 * 캔버스 오버레이 — 선택된 설비가 정확히 1 개이고 select 도구 모드일 때
 * 그 설비의 8 모서리·꼭지점 리사이즈 핸들을 띄운다. 케이블 그리기/스냅샷
 * 미리보기·연결 추적(하이라이트) 등 편집이 아닌 모드에서는 숨김.
 */
export function AssetResizeHandlesHost() {
  const tool = useEditorStore((s) => s.tool);
  const zoom = useEditorStore((s) => s.zoom);
  const panX = useEditorStore((s) => s.panX);
  const panY = useEditorStore((s) => s.panY);
  const activeFloorId = useEditorStore((s) => s.activeFloorId);
  const highlightActive = usePathHighlightStore((s) => s.active);
  const selected = useSelectedEquipment();

  if (tool !== 'select') return null;
  // 연결 추적(하이라이트) 중에는 편집 chrome 을 띄우지 않는다 — 하이라이트가 단일 비주얼.
  if (highlightActive) return null;
  if (!selected) return null;
  // 현재 층에 실제 배치된 설비만 핸들 표시. 도면에 없는 설비(모듈·내부설비·타 층)는 위치가 없어
  // 0,0 에 빈 리사이즈 핸들이 그려지므로 제외한다.
  if (selected.floorId !== activeFloorId || selected.positionX == null || selected.positionY == null) return null;

  return (
    <AssetResizeHandles
      equipment={selected}
      zoom={zoom}
      panX={panX}
      panY={panY}
    />
  );
}
