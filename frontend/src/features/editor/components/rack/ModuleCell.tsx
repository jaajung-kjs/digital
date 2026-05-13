import { useEditorStore } from '../../stores/editorStore';
import { useSlotDrag } from '../../hooks/useSlotDrag';
import { RACK_SLOT_COUNT, type ModuleSlotUpdate, type RackModule } from '../../../../types/rackModule';

interface Props {
  module: RackModule;
  siblings: RackModule[];
  gridRef: React.RefObject<HTMLElement | null>;
}

/**
 * 드래그 인디케이터의 grid 영역 계산.
 * - slotSpan 은 그대로 유지. slotIndex 만 valid 범위로 clamp.
 *   → 마지막 칸 근처에서 인디케이터가 절반으로 잘리는 현상 방지.
 * - 결과를 [1, RACK_SLOT_COUNT+1] 안으로 강제 → implicit row 생성 차단.
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

  // RESIZE: 셀 자체가 candidate.slotSpan 으로 그리드 안에서 늘어남(=베스트 프랙티스).
  //         별도 인디케이터 불필요 — 셀의 크기 변화가 곧 미리보기.
  // MOVE  : 셀은 원위치에 dim 상태로 유지. 후보 위치를 outline-only 인디케이터로 표시.
  //         → 사용자가 "복사본 2개" 로 인식하지 않음 (본체는 항상 하나).
  const cellSlotSpan = dragging && isResize && liveCandidate
    ? Math.max(1, Math.min(liveCandidate.slotSpan, RACK_SLOT_COUNT - module.slotIndex))
    : module.slotSpan;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onPointerDown={(e) => handlePointerDown(e, 'move')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          gridRow: `span ${cellSlotSpan}`,
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
        {/* 리사이즈 핸들 — h-3 (12px) + 가운데 흰색 그립 바 */}
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

      {/* MOVE 인디케이터 — outline-only (no fill, no text).
          - 풀 슬롯스팬 유지, slotIndex 만 clamp → 절대 잘리지 않음.
          - 채움/텍스트 없음 → 사용자에게 "복사본"으로 보이지 않음.
          - pointer-events-none → 밑의 셀들이 정상적으로 hover/click 받음.
          - z-10 으로 어떤 셀 위에 있어도 outline 이 잘 보임. */}
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
