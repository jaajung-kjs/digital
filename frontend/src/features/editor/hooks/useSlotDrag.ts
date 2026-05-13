import { useCallback, useEffect, useRef, useState } from 'react';
import { planMove, planResize, type PlanResult } from '../utils/slotGeometry';
import { RACK_SLOT_COUNT, type ModuleSlotUpdate, type RackModule } from '../../../types/rackModule';

type DragMode = 'move' | 'resize';
const CLICK_THRESHOLD_PX = 5;

export interface DragState {
  mode: DragMode;
  candidate: ModuleSlotUpdate;
  plan: PlanResult;
}

interface DragInternal {
  mode: DragMode;
  startY: number;
  slotPixelHeight: number;
  module: RackModule;
  siblings: RackModule[];
  active: boolean;
  plan: PlanResult;
  candidate: ModuleSlotUpdate;
}

interface UseSlotDragOptions {
  module: RackModule;
  siblings: RackModule[];
  gridRef: React.RefObject<HTMLElement | null>;
  onClick: () => void;
  onCommit: (updates: ModuleSlotUpdate[]) => void;
}

/**
 * 슬롯 그리드용 드래그 훅.
 *
 * 아키텍처:
 * - pointer capture **사용 안 함**. 대신 pointerdown 시 window 레벨 이벤트
 *   리스너 (move / up / cancel / Escape) 를 설치한다.
 * - 이벤트 출처가 셀이든, 다른 패널이든, 브라우저 밖이든 window 가 받기 때문에
 *   "드롭이 풀리지 않는" 엣지 케이스(capture 손실, pointercancel, 창 이탈 등)가
 *   원천 차단됨.
 * - 드래그 상태는 단일 객체 (DragState) 또는 null. setState 호출 3번 → 1번.
 */
export function useSlotDrag({ module, siblings, gridRef, onClick, onCommit }: UseSlotDragOptions) {
  const internalRef = useRef<DragInternal | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  // 콜백을 ref 로 잡아둬서 useEffect 의 deps 에 안 넣는다.
  // (콜백 reference 변화로 listener 가 매번 detach/attach 되지 않게)
  const callbacksRef = useRef({ onClick, onCommit });
  callbacksRef.current = { onClick, onCommit };

  const dragging = dragState != null;

  // 드래그 중에만 window 레벨 리스너 설치.
  // dragging boolean 만 deps 로 잡았으므로 setDragState 가 매 move 마다 호출돼도
  // 리스너는 재설치되지 않는다 (mount/unmount 한 번씩).
  useEffect(() => {
    if (!dragging) return;

    const update = (clientY: number) => {
      const live = internalRef.current;
      if (!live) return;
      const dy = clientY - live.startY;
      if (!live.active && Math.abs(dy) < CLICK_THRESHOLD_PX) return;
      live.active = true;
      const slotDelta = Math.round(dy / live.slotPixelHeight);

      let candidate: ModuleSlotUpdate;
      let plan: PlanResult;
      if (live.mode === 'move') {
        const newIndex = live.module.slotIndex + slotDelta;
        candidate = { id: live.module.id, slotIndex: newIndex, slotSpan: live.module.slotSpan };
        plan = planMove(live.module, live.siblings, newIndex);
      } else {
        const newSpan = Math.max(1, live.module.slotSpan + slotDelta);
        candidate = { id: live.module.id, slotIndex: live.module.slotIndex, slotSpan: newSpan };
        plan = planResize(live.module, live.siblings, newSpan);
      }
      live.candidate = candidate;
      live.plan = plan;
      setDragState({ mode: live.mode, candidate, plan });
    };

    const finish = (commit: boolean) => {
      const live = internalRef.current;
      internalRef.current = null;
      setDragState(null);
      if (!live) return;
      if (!commit) return; // cancel / Escape
      if (!live.active) {
        callbacksRef.current.onClick();
        return;
      }
      if (live.plan.rejected) return;
      callbacksRef.current.onCommit(live.plan.affected);
    };

    const onMove = (e: PointerEvent) => update(e.clientY);
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
    };
  }, [dragging]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>, mode: DragMode) => {
      // resize 핸들에서 호출돼도 셀 본체의 onPointerDown 으로 bubble 안 되게.
      e.stopPropagation();
      if (!gridRef.current) return;
      const gridHeight = gridRef.current.clientHeight;
      if (gridHeight <= 0) return;
      const slotPixelHeight = gridHeight / RACK_SLOT_COUNT;
      const initial: DragInternal = {
        mode,
        startY: e.clientY,
        slotPixelHeight,
        module,
        siblings,
        active: false,
        candidate: { id: module.id, slotIndex: module.slotIndex, slotSpan: module.slotSpan },
        plan: { affected: [], rejected: false },
      };
      internalRef.current = initial;
      setDragState({ mode, candidate: initial.candidate, plan: initial.plan });
    },
    [module, siblings, gridRef],
  );

  return { handlePointerDown, dragState };
}
