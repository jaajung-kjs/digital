/**
 * 평면도의 손짓 — **값 하나, 주인 하나**(CONVENTIONS §1.7-t·§1.7-s).
 *
 * 그리기·옮기기·밀기(팬)·누르기(고르기)가 모두 `gesture` 하나에 든다. 시작도 끝도 캔버스가
 * 받고(포인터 캡처), 손짓은 그것을 시작한 포인터의 것이다(`pointerId`). 끝낼 때는 상태가 아니라
 * **그 이벤트의 좌표와 세션**으로 다시 셈한다 — 마지막 move 와 up 이 한 작업에 몰려 와도
 * 놓은 자리가 버려지지 않는다.
 *
 * - 창 밖에서 뗀 손은 놓은 것이 아니다(`inWindow`).
 * - 캡처를 못 붙잡았거나 풀리면 `pointerup` 이 안 올 수 있다 — 그 자리에서 접는다.
 * - Esc 는 그리던 것까지 걷는다(그리고 배치 도구를 끈다).
 */
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { isCancelKey, isTypingTarget } from '../../../components/ui';
import { createDragSession, dragDelta, inWindow, isThresholdMet, type DragSession } from '../../canvas/drag';
import type { PlacedRect } from '../../canvas/hitTest';
import { screenToWorld, snapToGrid, type Viewport } from '../../canvas/transform';
import { SNAP_GRID } from '../../canvas/constants';
import { isDrawLargeEnough, normalizeRect } from '../../floorPlacement';

type Pt = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

export type Gesture =
  /** 밀기 — `select` 면 움직이지 않고 뗀 손이 빈 곳 누르기(고른 것 놓기)다. */
  | { kind: 'pan'; pointerId: number; startClient: Pt; startPan: Pt; moved: boolean; select: boolean }
  | { kind: 'draw'; pointerId: number; rackId: string; floorId: string; start: Pt; end: Pt }
  | { kind: 'move'; pointerId: number; session: DragSession; at: Pt | null };

export interface PlanGestureArgs {
  viewportRef: { current: Viewport };
  setViewport: Dispatch<SetStateAction<Viewport>>;
  /** 그 자리의 랙(맨 위). */
  hitAt: (world: Pt) => PlacedRect | null;
  /** 지금 배치 도구가 겨눈 것 — 꺼져 있으면 `null`. */
  armed: () => { rackId: string; floorId: string } | null;
  onDraw: (rackId: string, floorId: string, rect: Rect) => void;
  onMove: (rackId: string, at: Pt) => void;
  onSelect: (rackId: string | null) => void;
  /** Esc — 배치 도구를 끈다. */
  onEscape: () => void;
  /** 그림이 바뀌었다 — 다시 그린다. */
  onChange: () => void;
  /** 손이 움직였다 — 좌표 칸에 쓴다(리렌더 없이). */
  onPointerWorld: (world: Pt) => void;
}

export function usePlanGesture(args: PlanGestureArgs) {
  const a = useRef(args);
  a.current = args;
  const gesture = useRef<Gesture | null>(null);
  /** 끄는 중인 자리 — DOM 손잡이도 따라오게 state 로도 든다(캔버스는 `gesture` 를 읽는다). */
  const [movePreview, setMovePreview] = useState<{ id: string; x: number; y: number } | null>(null);
  const spaceDown = useRef(false);

  const worldOf = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const { zoom, panX, panY } = a.current.viewportRef.current;
    return screenToWorld(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), panX, panY, zoom);
  };
  const snapped = (p: Pt) => snapToGrid(p.x, p.y, SNAP_GRID);

  /** 손짓을 접는다 — 아무것도 남기지 않는다. */
  const fold = () => {
    if (!gesture.current) return;
    gesture.current = null;
    setMovePreview(null);
    a.current.onChange();
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target as HTMLElement | null)) return;
      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); spaceDown.current = true; }
      if (isCancelKey(e)) { fold(); a.current.onEscape(); }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
    // fold 는 ref 만 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (gesture.current) return; // 손짓은 포인터 하나의 것이다
    if (e.button !== 0 && e.button !== 1) return;
    const canvas = e.currentTarget;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      return; // 못 붙잡으면 끝을 못 받는다 — 시작하지 않는다
    }
    e.preventDefault();
    const world = worldOf(e);
    const { panX, panY } = a.current.viewportRef.current;
    const pan = (select: boolean): Gesture =>
      ({ kind: 'pan', pointerId: e.pointerId, startClient: { x: e.clientX, y: e.clientY }, startPan: { x: panX, y: panY }, moved: false, select });

    if (e.button === 1 || spaceDown.current) { gesture.current = pan(false); return; }
    const armed = a.current.armed();
    if (armed) {
      const p = snapped(world);
      gesture.current = { kind: 'draw', pointerId: e.pointerId, ...armed, start: p, end: p };
      a.current.onChange();
      return;
    }
    const hit = a.current.hitAt(world);
    /* 빈 곳 좌끌기 = 도면 밀기(트랙패드에는 가운데 단추가 없다), 그냥 누르면 고른 것을 놓는다. */
    gesture.current = hit ? { kind: 'move', pointerId: e.pointerId, session: createDragSession(hit, world), at: null } : pan(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const world = worldOf(e);
    a.current.onPointerWorld(world);
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    if (g.kind === 'pan') {
      const dx = e.clientX - g.startClient.x;
      const dy = e.clientY - g.startClient.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) g.moved = true;
      a.current.setViewport((prev) => ({ ...prev, panX: g.startPan.x + dx, panY: g.startPan.y + dy }));
    } else if (g.kind === 'draw') {
      g.end = snapped(world);
      a.current.onChange();
    } else {
      if (!g.session.moved && !isThresholdMet(g.session, world)) return;
      g.session.moved = true;
      g.at = dragDelta(g.session, world, snapped);
      setMovePreview({ id: g.session.assetId, ...g.at });
      a.current.onChange();
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gesture.current = null;
    setMovePreview(null);
    const inside = inWindow(e);
    if (g.kind === 'pan') {
      if (!g.moved && g.select) a.current.onSelect(null);
    } else if (g.kind === 'draw') {
      const rect = normalizeRect(g.start, snapped(worldOf(e)));
      if (inside && isDrawLargeEnough(rect)) a.current.onDraw(g.rackId, g.floorId, rect);
    } else if (!g.session.moved) {
      a.current.onSelect(g.session.assetId);
    } else if (inside) {
      const at = dragDelta(g.session, worldOf(e), snapped);
      if (at.x !== g.session.initial.x || at.y !== g.session.initial.y) a.current.onMove(g.session.assetId, at);
    }
    a.current.onChange();
  }

  /** 캡처가 풀렸거나 브라우저가 손짓을 가져갔다 — 끝을 못 받으므로 그 자리에서 접는다. */
  function onPointerLost(e: React.PointerEvent<HTMLCanvasElement>) {
    if (gesture.current?.pointerId === e.pointerId) fold();
  }

  return {
    gesture,
    movePreview,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerLost, onLostPointerCapture: onPointerLost },
  };
}
