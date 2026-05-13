import { useCallback } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useSlotDrag } from '../../hooks/useSlotDrag';
import { RACK_SLOT_COUNT, type ModuleSlotUpdate, type RackModule } from '../../../../types/rackModule';

interface Props {
  module: RackModule;
  siblings: RackModule[];
  gridRef: React.RefObject<HTMLElement | null>;
}

/**
 * 드래그 인디케이터 grid 좌표 계산.
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

  // stable callbacks → useSlotDrag 의 callbacksRef 가 매 렌더마다 재할당돼도
  // useEffect 가 재실행되지 않음.
  const onCommit = useCallback((updates: ModuleSlotUpdate[]) => {
    for (const u of updates) {
      updateRackModule(u.id, { slotIndex: u.slotIndex, slotSpan: u.slotSpan });
    }
    setHasChanges(true);
  }, [updateRackModule, setHasChanges]);

  const onClick = useCallback(() => {
    setSelectedRackModuleId(module.id);
  }, [setSelectedRackModuleId, module.id]);

  const { handlePointerDown, dragState } = useSlotDrag({
    module,
    siblings,
    gridRef,
    onClick,
    onCommit,
  });

  const color = module.categoryDisplayColor ?? '#6b7280';
  const dragging = dragState != null;
  const rejected = dragState?.plan.rejected === true;
  const isResize = dragState?.mode === 'resize';

  // RESIZE: 셀 자체가 candidate.slotSpan 으로 그리드 안에서 늘어남 (clamp 적용).
  // MOVE  : 셀은 원위치/원크기 유지, opacity 만 0.35 로 흐려짐.
  const cellSlotSpan = dragging && isResize && dragState
    ? Math.max(1, Math.min(dragState.candidate.slotSpan, RACK_SLOT_COUNT - module.slotIndex))
    : module.slotSpan;

  const cellStart = module.slotIndex + 1;
  const cellEnd = module.slotIndex + cellSlotSpan + 1;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onPointerDown={(e) => handlePointerDown(e, 'move')}
        style={{
          gridRowStart: cellStart,
          gridRowEnd: cellEnd,
          gridColumnStart: 1,
          gridColumnEnd: 2,
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
        {/* 리사이즈 핸들 — pointerdown 만 받음. 이후 이벤트는 window 레벨에서 처리. */}
        <div
          onPointerDown={(e) => handlePointerDown(e, 'resize')}
          className="absolute left-0 right-0 bottom-0 h-3 flex items-center justify-center cursor-ns-resize bg-black/10 hover:bg-black/25 transition-colors"
          title="드래그해서 크기 조절"
        >
          <span aria-hidden className="block w-6 h-0.5 rounded-full bg-white/70 mb-0.5" />
        </div>
      </div>

      {/* MOVE 인디케이터 — outline only. RESIZE 중에는 셀 자체가 늘어나므로 불필요. */}
      {dragging && !isResize && dragState && (() => {
        const area = indicatorGridArea(dragState.candidate.slotIndex, dragState.candidate.slotSpan);
        const borderColor = rejected ? '#ef4444' : color;
        return (
          <div
            aria-hidden
            className={`pointer-events-none rounded-md ${rejected ? 'animate-pulse' : ''}`}
            style={{
              gridRowStart: area.start,
              gridRowEnd: area.end,
              gridColumnStart: 1,
              gridColumnEnd: 2,
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
