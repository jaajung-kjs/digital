import type { EditorTool } from '../../../types/floorPlan';
import type { CableDrawingPhase } from '../stores/interactionStore';
import { useEditorStore } from '../stores/editorStore';
import { useInteractionStore } from '../stores/interactionStore';

export interface HintState {
  tool: EditorTool;
  isDrawingAsset: boolean;
  hasPreset: boolean;
  cablePhase: CableDrawingPhase | null;
}

/**
 * 현재 도구/단계에 맞는 캔버스 하단 안내 문구를 반환한다. 표시할 안내가
 * 없으면 null. 케이블의 모달 단계(selectingType / pickingSourceEndpoint /
 * pickingTargetEndpoint / ready)는 모달·피커가 흐름을 소유하므로 안내를 표시하지 않는다.
 */
export function getHintMessage(s: HintState): string | null {
  if (s.tool === 'asset') {
    if (s.isDrawingAsset) return '끝점을 클릭해 크기를 정하세요 · ESC 취소';
    if (s.hasPreset) return '클릭하면 랙이 배치됩니다 · ESC 취소';
    return '설비 시작점을 클릭하세요 · ESC 취소';
  }
  if (s.tool === 'cable') {
    if (s.cablePhase === 'selectingSource') return '출발 설비를 클릭하세요 · ESC 취소';
    if (s.cablePhase === 'drawingPath')
      return '경유점을 클릭하거나 도착 설비를 클릭하세요 · Shift 직선 · Backspace 되돌리기 · ESC 취소';
    return null;
  }
  return null;
}

/**
 * 캔버스 하단 중앙의 통합 도구 안내 바. 설비/케이블 도구의 안내를 단일
 * 컴포넌트로 통합한다. 표시할 안내가 없으면 아무것도 렌더하지 않는다.
 */
export function EditorHintBar() {
  const tool = useEditorStore((s) => s.tool);
  const isDrawingAsset = useEditorStore((s) => s.isDrawingAsset);
  const hasPreset = useEditorStore((s) => s.newAssetPreset != null);
  const cablePhase = useInteractionStore((s) =>
    s.mode.kind === 'cableDrawing' ? s.mode.data.phase : null,
  );

  const message = getHintMessage({
    tool,
    isDrawingAsset,
    hasPreset,
    cablePhase,
  });

  if (!message) return null;

  return (
    <div
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-legend bg-surface/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-md border border-line pointer-events-none select-none"
    >
      <span className="text-sm text-primary">{message}</span>
    </div>
  );
}
