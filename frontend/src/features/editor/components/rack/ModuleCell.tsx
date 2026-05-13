import { useEditorStore } from '../../stores/editorStore';
import { useSlotDrag } from '../../hooks/useSlotDrag';
import { RACK_SLOT_COUNT, type ModuleSlotUpdate, type RackModule } from '../../../../types/rackModule';

interface Props {
  module: RackModule;
  siblings: RackModule[];
  gridRef: React.RefObject<HTMLElement | null>;
}

/**
 * 드래그 인디케이터의 grid 좌표 계산.
 * - slotSpan 은 풀 사이즈로 유지. slotIndex 만 valid 범위로 clamp.
 *   → 마지막 슬롯 근처에서 인디케이터가 잘리지 않음.
 * - [1, RACK_SLOT_COUNT+1] 안으로 강제 → implicit row 생성 차단.
 */
function indicatorGridArea(slotIndex: number, slotSpan: number): { start: number; end: number } {
  const safeSpan = Math.max(1, Math.min(slotSpan, RACK_SLOT_COUNT));
  const maxStart = RACK_SLOT_COUNT - safeSpan;
  const clampedIndex = Math.max(0, Math.min(slotIndex, maxStart));
  return { start: clampedIndex + 1, end: clampedIndex + safeSpan + 1 };
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
    liveMode,
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
  const isResize = liveMode === 'resize';

  // RESIZE: 셀 자체가 candidate.slotSpan 으로 늘어남 (clamp 적용).
  // MOVE  : 셀은 원위치/원크기 유지 (dim 으로 표시).
  const cellSlotSpan = dragging && isResize && liveCandidate
    ? Math.max(1, Math.min(liveCandidate.slotSpan, RACK_SLOT_COUNT - module.slotIndex))
    : module.slotSpan;

  // 셀은 자기 슬롯에 explicit 으로 위치. auto-flow 비사용 → 인디케이터와 절대 충돌 안 함.
  const cellStart = module.slotIndex + 1;
  const cellEnd = module.slotIndex + cellSlotSpan + 1;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onPointerDown={(e) => handlePointerDown(e, 'move')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          gridRowStart: cellStart,
          gridRowEnd: cellEnd,
          backgroundColor: rejected && isResize ? '#ef4444' : color,
          opacity: dragging && !isResize ? 0.35 : 1,
        }}
        className={`relative flex items-center px-2 text-white text-xs font-medium rounded select-none cursor-grab hover:brightness-110 transition-opacity overflow-hidden min-h-0 ${
          rejected && isResize ? 'animate-pulse' : ''
        }`}
        title={`${module.name} (슬롯 ${module.slotIndex}~${module.slotIndex + module.slotSpan - 1}) — 클릭=편집, 드래그=이동, 하단 핸들=리사이즈`}
      >
        <span className="truncate flex-1">{module.name}</span>
        {module.categoryName && (
          <span className="text-[10px] opacity-80 ml-1.5 shrink-0">{module.categoryName}</span>
        )}
        {/* 리사이즈 핸들 */}
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
          <span aria-hidden className="block w-6 h-0.5 rounded-full bg-white/70 mb-0.5" />
        </div>
      </div>

      {/* MOVE 인디케이터 — outline-only.
          모든 grid 아이템이 explicit-placed 이므로 인디케이터가 어떤 슬롯에
          있어도 다른 셀들을 밀어내지 않는다. 원본 셀 자리에 겹쳐도 OK. */}
      {dragging && !isResize && liveCandidate && (() => {
        const area = indicatorGridArea(liveCandidate.slotIndex, liveCandidate.slotSpan);
        const borderColor = rejected ? '#ef4444' : color;
        return (
          <div
            aria-hidden
            className={`pointer-events-none rounded-md ${rejected ? 'animate-pulse' : ''}`}
            style={{
              gridRowStart: area.start,
              gridRowEnd: area.end,
              gridColumn: '1 / -1',
              boxShadow: `inset 0 0 0 2.5px ${borderColor}`,
              backgroundColor: 'transparent',
              zIndex: 10,
            }}
          />
        );
      })()}
    </>
  );
}
