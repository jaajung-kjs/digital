import { useCallback, useRef, useState } from 'react';
import { planMove, planResize, type PlanResult } from '../utils/slotGeometry';
import type { ModuleSlotUpdate, RackModule } from '../../../types/rackModule';

type DragMode = 'move' | 'resize';
const CLICK_THRESHOLD_PX = 5;

interface DragLive {
  mode: DragMode;
  startY: number;
  slotPixelHeight: number;
  module: RackModule;
  siblings: RackModule[];
  candidate: ModuleSlotUpdate;
  plan: PlanResult;
  active: boolean;
}

interface UseSlotDragOptions {
  module: RackModule;
  siblings: RackModule[];
  gridRef: React.RefObject<HTMLElement | null>;
  onClick: () => void;
  onCommit: (updates: ModuleSlotUpdate[]) => void;
}

export function useSlotDrag({ module, siblings, gridRef, onClick, onCommit }: UseSlotDragOptions) {
  const liveRef = useRef<DragLive | null>(null);
  const [livePlan, setLivePlan] = useState<PlanResult | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>, mode: DragMode) => {
      e.stopPropagation();
      if (!gridRef.current) return;
      const gridHeight = gridRef.current.clientHeight;
      const slotPixelHeight = gridHeight / 12;
      liveRef.current = {
        mode,
        startY: e.clientY,
        slotPixelHeight,
        module,
        siblings,
        candidate: { id: module.id, slotIndex: module.slotIndex, slotSpan: module.slotSpan },
        plan: { affected: [], rejected: false },
        active: false,
      };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    [module, siblings, gridRef],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const live = liveRef.current;
    if (!live) return;
    const dy = e.clientY - live.startY;
    const slotDelta = Math.round(dy / live.slotPixelHeight);
    if (!live.active && Math.abs(dy) < CLICK_THRESHOLD_PX) return;
    live.active = true;

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
    setLivePlan(plan);
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const live = liveRef.current;
      liveRef.current = null;
      setLivePlan(null);
      if (!live) return;
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      if (!live.active) {
        onClick();
        return;
      }
      if (live.plan.rejected) return;
      onCommit(live.plan.affected);
    },
    [onClick, onCommit],
  );

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    livePlan,
  };
}
