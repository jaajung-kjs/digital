import { useEditorStore } from '../../stores/editorStore';
import { useSlotDrag } from '../../hooks/useSlotDrag';
import type { ModuleSlotUpdate, RackModule } from '../../../../types/rackModule';

interface Props {
  module: RackModule;
  siblings: RackModule[];
  gridRef: React.RefObject<HTMLElement | null>;
}

export function ModuleCell({ module, siblings, gridRef }: Props) {
  const setSelectedRackModuleId = useEditorStore((s) => s.setSelectedRackModuleId);
  const updateRackModule = useEditorStore((s) => s.updateRackModule);
  const setHasChanges = useEditorStore((s) => s.setHasChanges);

  const onCommit = (updates: ModuleSlotUpdate[]) => {
    for (const u of updates) {
      updateRackModule(u.id, { slotIndex: u.slotIndex, slotSpan: u.slotSpan });
    }
    setHasChanges(true);
  };

  const {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    livePlan,
    liveCandidate,
  } = useSlotDrag({
    module,
    siblings,
    gridRef,
    onClick: () => setSelectedRackModuleId(module.id),
    onCommit,
  });

  const color = module.categoryDisplayColor ?? '#6b7280';
  const dragging = liveCandidate != null;
  const rejected = livePlan?.rejected === true;

  // 미리보기 색상: 거부=빨강 반투명, 정상=원 색 반투명 + 점선 테두리
  const previewBg = rejected ? 'rgba(239,68,68,0.35)' : 'rgba(59,130,246,0.25)';
  const previewBorder = rejected ? '#ef4444' : '#3b82f6';

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onPointerDown={(e) => handlePointerDown(e, 'move')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          gridRow: `span ${module.slotSpan}`,
          backgroundColor: color,
          opacity: dragging ? 0.35 : 1,
        }}
        className="relative flex items-center px-2 text-white text-xs font-medium rounded select-none cursor-grab hover:brightness-110 transition-opacity overflow-hidden min-h-0"
        title={`${module.name} (슬롯 ${module.slotIndex}~${module.slotIndex + module.slotSpan - 1}) — 클릭=편집, 드래그=이동, 하단 핸들=리사이즈`}
      >
        <span className="truncate flex-1">{module.name}</span>
        {module.categoryName && (
          <span className="text-[10px] opacity-80 ml-1.5 shrink-0">{module.categoryName}</span>
        )}
        {/* 리사이즈 핸들 — 잡기 쉬운 크기(h-3) + 시각 단서(점 3개) */}
        <div
          onPointerDown={(e) => {
            e.stopPropagation();
            handlePointerDown(e, 'resize');
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="absolute left-0 right-0 bottom-0 h-3 flex items-center justify-center cursor-ns-resize bg-black/10 hover:bg-black/25 transition-colors"
          title="드래그해서 크기 조절"
        >
          <span
            aria-hidden
            className="block w-6 h-0.5 rounded-full bg-white/70 mb-0.5"
          />
        </div>
      </div>

      {/* 드래그 미리보기 — 후보 위치/크기에 점선 박스로 표시 */}
      {dragging && liveCandidate && (
        <div
          aria-hidden
          className={`pointer-events-none rounded ${rejected ? 'animate-pulse' : ''}`}
          style={{
            gridRowStart: liveCandidate.slotIndex + 1,
            gridRowEnd: liveCandidate.slotIndex + liveCandidate.slotSpan + 1,
            gridColumn: '1 / -1',
            backgroundColor: previewBg,
            border: `2px dashed ${previewBorder}`,
            zIndex: 10,
          }}
        />
      )}
    </>
  );
}
