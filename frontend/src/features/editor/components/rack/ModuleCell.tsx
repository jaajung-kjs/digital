import { useCallback } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useSubstationWorkingCopy } from '../../../workingCopy/substationStore';
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
  const stageRackModuleUpdate = useSubstationWorkingCopy((s) => s.stageRackModuleUpdate);

  const onCommit = useCallback((updates: ModuleSlotUpdate[]) => {
    for (const u of updates) {
      stageRackModuleUpdate(u.id, { slotIndex: u.slotIndex, slotSpan: u.slotSpan });
    }
  }, [stageRackModuleUpdate]);

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

  // 셀은 어떤 모드든 항상 원래 슬롯에 원래 크기로 dim 표시 (이동 모드와 동일).
  // 후보 위치/크기는 outline 인디케이터로 시각화.
  const cellStart = module.slotIndex + 1;
  const cellEnd = module.slotIndex + module.slotSpan + 1;

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
          backgroundColor: color,
          opacity: dragging ? 0.35 : 1,
        }}
        className="relative flex items-center px-2 text-white text-xs font-medium rounded select-none cursor-grab hover:brightness-110 transition-opacity overflow-hidden min-h-0"
        aria-label={`${module.name}, 슬롯 ${module.slotIndex + 1}-${module.slotIndex + module.slotSpan} (${module.slotSpan}슬롯) — 클릭하여 편집`}
        title="클릭=편집, 드래그=이동, 하단 핸들=리사이즈"
      >
        <span className="truncate flex-1">{module.name}</span>
        {/* 리사이즈 핸들 — 흰 그립 항상 표시 (opacity-70 → hover 100). */}
        <div
          onPointerDown={(e) => handlePointerDown(e, 'resize')}
          className="absolute left-0 right-0 bottom-0 h-3 flex items-center justify-center cursor-ns-resize bg-black/15 hover:bg-black/30 transition-colors"
          title="드래그해서 크기 조절"
          aria-label="크기 조절 핸들"
        >
          <span aria-hidden className="block w-7 h-0.5 rounded-full bg-white opacity-70 mb-0.5" />
        </div>
      </div>

      {/* 통합 드래그 인디케이터 — 이동/리사이즈 모두 동일 outline.
          - 풀 슬롯스팬 유지, slotIndex 만 clamp → 절대 잘리지 않음
          - pointer-events-none → 아래 셀들 hover/click 통과
          - 거부 시 빨간 outline + animate-pulse (셀 자체는 안 깜빡임 → 깜빡임 버그 해결) */}
      {dragging && dragState && (() => {
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
