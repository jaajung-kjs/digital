import { useCallback } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useSlotDrag } from '../../hooks/useSlotDrag';
import { useEditorHistory } from '../../hooks/useEditorHistory';
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

  const { pushHistory } = useEditorHistory();

  // stable callbacks → useSlotDrag 의 callbacksRef 가 매 렌더마다 재할당돼도
  // useEffect 가 재실행되지 않음.
  const onCommit = useCallback((updates: ModuleSlotUpdate[]) => {
    // Snapshot BEFORE mutation so Ctrl+Z restores the pre-drag state.
    const { localEquipment } = useEditorStore.getState();
    pushHistory(localEquipment);
    for (const u of updates) {
      updateRackModule(u.id, { slotIndex: u.slotIndex, slotSpan: u.slotSpan });
    }
    setHasChanges(true);
  }, [updateRackModule, setHasChanges, pushHistory]);

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
        aria-label={`${module.name}, 슬롯 ${module.slotIndex + 1}-${module.slotIndex + module.slotSpan} (${module.slotSpan}슬롯) — 클릭하여 편집`}
        title="클릭=편집, 드래그=이동, 하단 핸들=리사이즈"
      >
        <span className="truncate flex-1">{module.name}</span>
        {/* 리사이즈 핸들 — 그립을 항상 표시해 핸들 영역이 발견 가능하게 한다.
            opacity-70 (기본) → hover 시 100%. pointerdown 만 받고 이후는 window 레벨. */}
        <div
          onPointerDown={(e) => handlePointerDown(e, 'resize')}
          className="absolute left-0 right-0 bottom-0 h-3 flex items-center justify-center cursor-ns-resize bg-black/15 hover:bg-black/30 transition-colors"
          title="드래그해서 크기 조절"
          aria-label="크기 조절 핸들"
        >
          <span aria-hidden className="block w-7 h-0.5 rounded-full bg-white opacity-70 mb-0.5" />
        </div>
      </div>

      {/* RESIZE 중 원본 크기 outline — 셀이 늘어나는 동안 "원래 어디까지였는지"
          를 옅은 회색 점선으로 표시 → before/after 가 한눈에 보임. */}
      {dragging && isResize && (
        <div
          aria-hidden
          className="pointer-events-none rounded-md"
          style={{
            gridRowStart: module.slotIndex + 1,
            gridRowEnd: module.slotIndex + module.slotSpan + 1,
            gridColumnStart: 1,
            gridColumnEnd: 2,
            boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.4)',
            backgroundColor: 'transparent',
            // 원본 outline 은 셀 위(zIndex 11)에 떠야 펄스 셀의 색으로도 안 가려짐.
            zIndex: 11,
          }}
        />
      )}

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
