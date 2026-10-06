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
 * - 크기 조절도 같은 주인이다 — 손잡이는 `data-handle` 로 자기를 알릴 뿐이다.
 * - 판이 내려가면 손짓도 함께 접힌다.
 */
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { isCancelKey, isTypingTarget } from '../../../components/ui';
import { createDragSession, dragDelta, inWindow, isThresholdMet, type DragSession } from '../../canvas/drag';
import type { PlacedRect } from '../../canvas/hitTest';
import { screenToWorld, snapToGrid, type Viewport } from '../../canvas/transform';
import { SNAP_GRID } from '../../canvas/constants';
import { applyResize, type HandleKey } from '../../canvas/resize';
import { isDrawLargeEnough, normalizeRect } from '../../floorPlacement';

type Pt = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

export type Gesture =
  /** 밀기 — `select` 면 움직이지 않고 뗀 손이 빈 곳 누르기(고른 것 놓기)다. */
  | { kind: 'pan'; pointerId: number; startClient: Pt; startPan: Pt; moved: boolean; select: boolean }
  | { kind: 'draw'; pointerId: number; rackId: string; floorId: string; start: Pt; end: Pt }
  | { kind: 'move'; pointerId: number; session: DragSession; at: Pt | null }
  | { kind: 'resize'; pointerId: number; rackId: string; handle: HandleKey; startClient: Pt; startRect: Rect; rect: Rect };

/** 끄는 중인 자리 — 옮기기면 x·y 만, 크기면 넷 다. */
export type Preview = { id: string; x: number; y: number; width?: number; height?: number };

/** 크기를 바꿀 때 가장 작은 변(cm). */
const MIN_SIZE = 20;

export interface PlanGestureArgs {
  viewportRef: { current: Viewport };
  setViewport: Dispatch<SetStateAction<Viewport>>;
  /** 그 자리의 랙(맨 위). */
  hitAt: (world: Pt) => PlacedRect | null;
  /** 손잡이가 달린 랙(고른 놓인 랙) — 없으면 `null`. */
  resizable: () => PlacedRect | null;
  /** 지금 배치 도구가 겨눈 것 — 꺼져 있으면 `null`. */
  armed: () => { rackId: string; floorId: string } | null;
  onDraw: (rackId: string, floorId: string, rect: Rect) => void;
  onMove: (rackId: string, at: Pt) => void;
  onResize: (rackId: string, rect: Rect) => void;
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
  const [preview, setPreview] = useState<Preview | null>(null);
  const spaceDown = useRef(false);

  const worldOf = (e: React.PointerEvent<HTMLElement>): Pt => {
    const { zoom, panX, panY } = a.current.viewportRef.current;
    return screenToWorld(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), panX, panY, zoom);
  };
  const snapped = (p: Pt) => snapToGrid(p.x, p.y, SNAP_GRID);

  /** 손잡이 손짓의 지금 사각형 — 배율은 **이벤트 시점**의 것을 읽는다(끄는 중 확대 대비). */
  const resized = (g: Extract<Gesture, { kind: 'resize' }>, e: { clientX: number; clientY: number }): Rect => {
    const scale = a.current.viewportRef.current.zoom / 100;
    const d = { x: (e.clientX - g.startClient.x) / scale, y: (e.clientY - g.startClient.y) / scale };
    return applyResize(g.startRect, g.handle, d, MIN_SIZE, (v) => Math.round(v / SNAP_GRID) * SNAP_GRID);
  };

  /** 손짓을 접는다 — 아무것도 남기지 않는다. */
  const fold = () => {
    if (!gesture.current) return;
    gesture.current = null;
    setPreview(null);
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
  /* 판이 내려가면 손짓도 접힌다 — 남은 손짓이 나중에 쓰지 못하게. */
  useEffect(() => () => { gesture.current = null; }, []);

  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (gesture.current) return; // 손짓은 포인터 하나의 것이다
    if (e.button !== 0 && e.button !== 1) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      return; // 못 붙잡으면 끝을 못 받는다 — 시작하지 않는다
    }
    e.preventDefault();
    const world = worldOf(e);
    const { panX, panY } = a.current.viewportRef.current;
    const pan = (select: boolean): Gesture =>
      ({ kind: 'pan', pointerId: e.pointerId, startClient: { x: e.clientX, y: e.clientY }, startPan: { x: panX, y: panY }, moved: false, select });

    if (e.button === 1 || spaceDown.current) { gesture.current = pan(false); return; }
    const handle = (e.target as HTMLElement).closest?.('[data-handle]')?.getAttribute('data-handle') as HandleKey | null | undefined;
    const target = handle ? a.current.resizable() : null;
    if (handle && target) {
      const startRect = { x: target.x, y: target.y, width: target.width, height: target.height };
      gesture.current = { kind: 'resize', pointerId: e.pointerId, rackId: target.id, handle, startClient: { x: e.clientX, y: e.clientY }, startRect, rect: startRect };
      return;
    }
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

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
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
    } else if (g.kind === 'resize') {
      g.rect = resized(g, e);
      setPreview({ id: g.rackId, ...g.rect });
      a.current.onChange();
    } else {
      if (!g.session.moved && !isThresholdMet(g.session, world)) return;
      g.session.moved = true;
      g.at = dragDelta(g.session, world, snapped);
      setPreview({ id: g.session.assetId, ...g.at });
      a.current.onChange();
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gesture.current = null;
    setPreview(null);
    const inside = inWindow(e);
    if (g.kind === 'pan') {
      if (!g.moved && g.select) a.current.onSelect(null);
    } else if (g.kind === 'draw') {
      const rect = normalizeRect(g.start, snapped(worldOf(e)));
      if (inside && isDrawLargeEnough(rect)) a.current.onDraw(g.rackId, g.floorId, rect);
    } else if (g.kind === 'resize') {
      const r = resized(g, e);
      const same = r.x === g.startRect.x && r.y === g.startRect.y && r.width === g.startRect.width && r.height === g.startRect.height;
      if (inside && !same) a.current.onResize(g.rackId, r);
    } else if (!g.session.moved) {
      a.current.onSelect(g.session.assetId);
    } else if (inside) {
      const at = dragDelta(g.session, worldOf(e), snapped);
      if (at.x !== g.session.initial.x || at.y !== g.session.initial.y) a.current.onMove(g.session.assetId, at);
    }
    a.current.onChange();
  }

  /** 캡처가 풀렸거나 브라우저가 손짓을 가져갔다 — 끝을 못 받으므로 그 자리에서 접는다. */
  function onPointerLost(e: React.PointerEvent<HTMLElement>) {
    if (gesture.current?.pointerId === e.pointerId) fold();
  }

  return {
    gesture,
    preview,
    fold,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerLost, onLostPointerCapture: onPointerLost },
  };
}
