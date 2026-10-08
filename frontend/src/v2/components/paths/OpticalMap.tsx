/**
 * 광 계통도 그림 — 국 = 마디, 광선로 = 간선(국 쌍 사이 여러 가닥이면 평행 곡선), 그 위에 고른 회선의 경로.
 *
 * **도면의 어법**(CONVENTIONS §3.4): 좌표는 배치(`computeLayout`)의 것을 화면으로 옮겨 그리고, 주기(국 이름)와 선 굵기는
 * **화면 px 고정**이다 — 확대해도 글자가 커지지 않고, 줄여도 읽힌다. 글자에는 흰 테(halo).
 *
 * **손짓은 하나의 값**(§1.7-t): 끌어 옮기기와 누르기가 `gesture` 하나에 들고, 시작도 끝도 이 판이 받는다(포인터 캡처).
 * 국·광선로는 `data-station`·`data-line` 으로 자기를 알릴 뿐이다. 문턱(3px)을 넘으면 옮기기, 못 넘고 떼면 누르기.
 * 휠은 커서 아래를 붙든 채 확대(평면도와 같은 `zoomAtPoint`), 터치는 두 손가락 벌리기·오므리기로 확대(두 손가락 가운데를 붙든다),
 * 「맞추기」는 국 전체를 한눈에(최대 100%).
 *
 * 광선로 이름표(`선로명 · n심 · km`)는 **확대했을 때**(`LABEL_ZOOM` 이상) 또는 고른 회선·경고가 지나는 광선로에만 선다 —
 * 줄인 그림에서 모두 세우면 글자가 겹쳐 국 이름까지 가린다.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { compareName, type PathBundle } from '@twin/core';
import { cn, isCommitKey, kmText } from '../../../components/ui';
import { DRAG_THRESHOLD } from '../../canvas/drag';
import { contentBounds, fitViewport } from '../../canvas/fitView';
import { zoomAtPoint, ZOOM_STEP, type Viewport } from '../../canvas/transform';
import type { MapLine, MapStation, OpticalMapModel } from './opticalMapModel';
import { dutyAttr, dutyStroke } from './duty';

type Pt = { x: number; y: number };
type Duty = PathBundle['duty'];

/** 같은 국 쌍의 평행 가닥 사이 — 화면 px(줄여도 두 가닥으로 읽히게). */
const LANE_GAP = 16;
/** 한 광선로를 고른 회선 여럿이 지나면 그 겹침끼리 벌리는 폭. */
const OVERLAY_GAP = 5;
/** 맞출 때 국 하나가 차지한다고 보는 자리(배치 좌표) — 이름 글자까지 판 안에 들게. */
const NODE_BOX = { w: 150, h: 56 };
/** 이 배율(%) 이상이면 모든 광선로에 이름표를 세운다. */
const LABEL_ZOOM = 130;
/** 이름표 양옆에 남길 선 길이(화면 px) — 국 이름(마디 아래 글자)과 겹치지 않을 만큼. */
const LABEL_CLEAR = 48;
/** 이름표 글자 폭 어림 — 12px 글자에서 한글 12px, 그 밖 7px. */
const labelWidth = (t: string) => [...t].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 12 : 7), 0);

// ── 보는 자리(배율·이동) ─────────────────────────────────────────────────────

/**
 * 광 계통도의 뷰포트 — 판이 붙을 때 크기를 재고(ref 콜백, §1.7-q) 휠을 듣는다. 자료(국 집합)마다 **한 번만** 맞춘다 —
 * 사람이 밀어 둔 화면을 다시 그릴 때마다 도로 당기지 않는다.
 */
export function useMapViewport(model: Pick<OpticalMapModel, 'positions'> & { key: string }) {
  const [viewport, setViewport] = useState<Viewport>({ zoom: 100, panX: 0, panY: 0 });
  const box = useRef<HTMLDivElement | null>(null);
  const fitted = useRef<string | null>(null);
  const latest = useRef(model);
  latest.current = model;

  const fit = useCallback((force: boolean) => {
    const el = box.current;
    const m = latest.current;
    if (!el || (!force && fitted.current === m.key)) return;
    const r = el.getBoundingClientRect();
    const rects = [...m.positions.values()].map((p) => ({ x: p.x - NODE_BOX.w / 2, y: p.y - NODE_BOX.h / 2 + 12, width: NODE_BOX.w, height: NODE_BOX.h }));
    const next = fitViewport(contentBounds(rects), { width: r.width, height: r.height });
    if (!next) return;
    fitted.current = m.key;
    setViewport(next);
  }, []);

  const detach = useRef<(() => void) | null>(null);
  const attach = useCallback((el: HTMLDivElement | null) => {
    detach.current?.();
    detach.current = null;
    box.current = el;
    if (!el) return;
    /* 커서 아래 그림을 붙든 채 — 브라우저 확대를 막아야 하므로 passive 가 아니다. */
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setViewport((v) => zoomAtPoint(v, e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, e.clientX - r.left, e.clientY - r.top));
    };
    const ro = new ResizeObserver(() => fit(false));
    ro.observe(el);
    el.addEventListener('wheel', onWheel, { passive: false });
    fit(false);
    detach.current = () => { ro.disconnect(); el.removeEventListener('wheel', onWheel); };
  }, [fit]);

  /* 자료가 바뀌면(다른 범위) 그 자료로 한 번 맞춘다 — 이미 맞춘 자료면 아무 일도 없다. */
  useEffect(() => fit(false));

  const zoomBy = useCallback((factor: number) => {
    const r = box.current?.getBoundingClientRect();
    setViewport((v) => zoomAtPoint(v, factor, (r?.width ?? 0) / 2, (r?.height ?? 0) / 2));
  }, []);

  return { viewport, setViewport, attach, refit: () => fit(true), zoomIn: () => zoomBy(ZOOM_STEP), zoomOut: () => zoomBy(1 / ZOOM_STEP) };
}

// ── 그림 ─────────────────────────────────────────────────────────────────────

export interface OpticalMapProps {
  model: Pick<OpticalMapModel, 'stations' | 'lines' | 'positions'>;
  viewport: Viewport;
  setViewport: (update: (v: Viewport) => Viewport) => void;
  /** 판 상자(ref 콜백) — `useMapViewport().attach`. */
  boxRef: (el: HTMLDivElement | null) => void;
  /** 광선로 → 그 위를 지나는 고른 회선들의 주/예비. */
  overlay: ReadonlyMap<string, readonly Duty[]>;
  /** 고른 이중화 경고가 함께 지나는 광선로. */
  warned: ReadonlySet<string>;
  onStation: (id: string) => void;
  onLine: (line: MapLine) => void;
}

type Gesture = { pointerId: number; start: Pt; startPan: Pt; moved: boolean; target: { kind: 'station' | 'line'; id: string } | null };
/** 두 손가락 확대 — 시작할 때의 두 점 사이 거리와 뷰포트. */
type Pinch = { dist: number; viewport: Viewport };

export function OpticalMap({ model, viewport, setViewport, boxRef, overlay, warned, onStation, onLine }: OpticalMapProps) {
  const s = viewport.zoom / 100;
  const at = (id: string): Pt | null => {
    const p = model.positions.get(id);
    return p ? { x: p.x * s + viewport.panX, y: p.y * s + viewport.panY } : null;
  };
  const lineById = new Map(model.lines.map((l) => [l.id, l]));
  const activate = (t: NonNullable<Gesture['target']>) => {
    if (t.kind === 'station') onStation(t.id);
    else { const l = lineById.get(t.id); if (l) onLine(l); }
  };

  /* 손짓 — 값 하나, 주인 하나(§1.7-t). 두 손가락이 닿으면 끌기·누르기를 접고 확대(pinch)로 바꾼다. */
  const gesture = useRef<Gesture | null>(null);
  const touches = useRef(new Map<number, Pt>());
  const pinch = useRef<Pinch | null>(null);
  const span = () => {
    const [p, q] = [...touches.current.values()];
    return p && q ? { dist: Math.hypot(q.x - p.x, q.y - p.y), mid: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } } : null;
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const sp = touches.current.size === 2 ? span() : null;
      if (sp && sp.dist > 0) {
        pinch.current = { dist: sp.dist, viewport };
        gesture.current = null;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 못 붙잡아도 확대는 둔다 */ }
        return;
      }
    }
    /* 다른 손가락(주 포인터 아님)은 손짓을 건드리지 않는다. 주 포인터의 새 누름은 남은 손짓을 갈음한다 —
       끝 신호(up·캡처 분실)를 못 받은 손짓이 판을 영영 막지 않게. */
    if (e.button !== 0 || (gesture.current && e.isPrimary === false)) return;
    const hit = (e.target as Element).closest?.('[data-station-hit],[data-station],[data-line]');
    const station = hit?.getAttribute('data-station-hit') ?? hit?.getAttribute('data-station');
    const target = station != null
      ? { kind: 'station' as const, id: station }
      : hit?.getAttribute('data-line') != null ? { kind: 'line' as const, id: hit.getAttribute('data-line')! } : null;
    gesture.current = { pointerId: e.pointerId, start: { x: e.clientX, y: e.clientY }, startPan: { x: viewport.panX, y: viewport.panY }, moved: false, target };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 못 붙잡아도 손짓은 둔다 — up 이 안 오면 다음 누름이 갈음한다 */ }
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pz = pinch.current;
    const sp = pz ? span() : null;
    if (pz && sp) {
      const r = e.currentTarget.getBoundingClientRect();
      setViewport(() => zoomAtPoint(pz.viewport, sp.dist / pz.dist, sp.mid.x - r.left, sp.mid.y - r.top));
      return;
    }
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const dx = e.clientX - g.start.x;
    const dy = e.clientY - g.start.y;
    if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    g.moved = true;
    setViewport((v) => ({ ...v, panX: g.startPan.x + dx, panY: g.startPan.y + dy }));
  };
  const endTouch = (e: ReactPointerEvent<HTMLDivElement>) => {
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) pinch.current = null;
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    endTouch(e);
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gesture.current = null;
    if (!g.moved && g.target) activate(g.target);
  };
  const fold = (e: ReactPointerEvent<HTMLDivElement>) => {
    endTouch(e);
    if (gesture.current?.pointerId === e.pointerId) gesture.current = null;
  };
  const onKey = (t: NonNullable<Gesture['target']>) => (e: ReactKeyboardEvent) => {
    if (!isCommitKey(e) && e.key !== ' ') return;
    e.preventDefault();
    activate(t);
  };

  /* 경로가 지나는 국 — 마디 테두리를 강조한다. */
  const touched = new Set<string>();
  for (const id of overlay.keys()) { const l = lineById.get(id); if (l) { touched.add(l.a); touched.add(l.b); } }

  const curves = model.lines.flatMap((l) => {
    const a = at(l.a);
    const b = at(l.b);
    return a && b ? [{ line: l, a, b }] : [];
  });

  return (
    <div
      ref={boxRef}
      data-testid="optical-map"
      className="relative min-h-0 min-w-0 flex-1 cursor-grab touch-none select-none overflow-hidden bg-surface active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={fold}
      onLostPointerCapture={fold}
    >
      {/* `group` — 안의 국·광선로 단추가 보조 기술에 드러나야 한다(`img` 는 자식을 감춘다). */}
      <svg className="absolute inset-0 h-full w-full" role="group" aria-label="광 계통도">
        {/* 고른 이중화 경고가 함께 지나는 광선로 — 맨 아래 넓은 띠. */}
        {curves.filter((c) => warned.has(c.line.id)).map(({ line, a, b }) => (
          <path key={`w-${line.id}`} d={curvePath(line, a, b, 0)} data-warned={line.id} className="fill-none stroke-lamp-warning opacity-50" strokeWidth={12} strokeLinecap="round" />
        ))}
        {curves.map(({ line, a, b }) => (
          <path key={line.id} d={curvePath(line, a, b, 0)} data-testid="map-line" className="pointer-events-none fill-none stroke-line-strong" strokeWidth={1.5} />
        ))}
        {/* 고른 회선 — 주회선 실선 · 예비회선 점선 · 주/예비 미지정은 옅은 강조색. 한 광선로를 여럿이 지나면 나란히 벌린다. */}
        {curves.flatMap(({ line, a, b }) => {
          const duties = [...new Set(overlay.get(line.id) ?? [])];
          return duties.map((duty, i) => {
            const st = dutyStroke(duty);
            return (
              <path
                key={`o-${line.id}-${dutyAttr(duty)}`}
                d={curvePath(line, a, b, (i - (duties.length - 1) / 2) * OVERLAY_GAP)}
                data-overlay={line.id}
                data-duty={dutyAttr(duty)}
                className={cn('pointer-events-none fill-none', st.className)}
                strokeWidth={st.width}
                strokeDasharray={st.dash}
                strokeLinecap={st.cap}
              />
            );
          });
        })}
        {/* 광선로 이름표 — 확대했거나 고른 회선·경고가 지나는 광선로만, 그리고 선이 이름표보다 길 때만(짧은 선에 세우면 국 이름을 덮는다). */}
        {curves.filter(({ line }) => viewport.zoom >= LABEL_ZOOM || overlay.has(line.id) || warned.has(line.id)).flatMap(({ line, a, b }) => {
          const text = lineLabel(line);
          if (Math.hypot(b.x - a.x, b.y - a.y) < labelWidth(text) + LABEL_CLEAR) return [];
          const at = labelPlace(line, a, b);
          return [(
            <text
              key={`t-${line.id}`} x={at.x} y={at.y} textAnchor={at.anchor} data-line-label={line.id}
              className="pointer-events-none fill-content-muted stroke-surface text-xs [paint-order:stroke]" strokeWidth={4} strokeLinejoin="round"
            >
              {text}
            </text>
          )];
        })}
        {/* Tab 차례 — 국 먼저(이름 순), 그다음 광선로(이름 순). DOM 차례가 곧 Tab 차례다. */}
        {model.stations.map((st) => {
          const p = at(st.id);
          if (!p) return null;
          return <StationMark key={st.id} station={st} at={p} lit={touched.has(st.id)} onKeyDown={onKey({ kind: 'station', id: st.id })} />;
        })}
        {[...curves].sort((x, y) => compareName(x.line.name, y.line.name)).map(({ line, a, b }) => {
          const d = curvePath(line, a, b, 0);
          return (
            <g key={`h-${line.id}`} data-line={line.id} className="group cursor-pointer outline-none" role="button" tabIndex={0} aria-label={`${line.name} 선번장에서 보기`} onKeyDown={onKey({ kind: 'line', id: line.id })}>
              <title>{`${line.name} — 선번장에서 보기`}</title>
              <path d={d} className="fill-none stroke-transparent" strokeWidth={14} />
              <path d={d} className="pointer-events-none fill-none stroke-transparent group-hover:stroke-content-muted" strokeWidth={1.5} />
              <path d={d} className="pointer-events-none fill-none stroke-transparent group-focus-visible:stroke-primary" strokeWidth={5} />
            </g>
          );
        })}
        {/* 국 누름 자리 — 광선로 누름 띠보다 위에 둔다(광선로 끝이 국을 덮지 않게). 초점은 위 국 단추가 받는다. */}
        {model.stations.map((st) => {
          const p = at(st.id);
          return p ? <circle key={`hit-${st.id}`} data-station-hit={st.id} cx={p.x} cy={p.y} r={14} className="cursor-pointer fill-transparent" aria-hidden /> : null;
        })}
      </svg>
    </div>
  );
}

function StationMark({ station: st, at: p, lit, onKeyDown }: { station: MapStation; at: Pt; lit: boolean; onKeyDown: (e: ReactKeyboardEvent) => void }) {
  return (
    <g
      data-station={st.id}
      data-in-scope={st.inScope}
      className={cn('group cursor-pointer outline-none', !st.inScope && 'opacity-50')}
      role="button"
      tabIndex={0}
      aria-label={`${st.name}${st.inScope ? '' : ' (범위 밖)'} 현황 보기`}
      onKeyDown={onKeyDown}
    >
      <title>{`${st.name}${st.inScope ? '' : ' — 범위 밖'} · 현황 보기`}</title>
      <circle
        cx={p.x} cy={p.y} r={6}
        className={cn('fill-surface group-hover:fill-surface-2 group-focus-visible:stroke-primary group-focus-visible:[stroke-width:4px]', lit ? 'stroke-primary' : 'stroke-content')}
        strokeWidth={lit ? 3 : 2}
        strokeDasharray={st.inScope ? undefined : '3 2'}
      />
      <text
        x={p.x} y={p.y + 22} textAnchor="middle"
        className={cn('stroke-surface text-xs font-medium [paint-order:stroke]', st.inScope ? 'fill-content' : 'fill-content-muted')}
        strokeWidth={4} strokeLinejoin="round"
      >
        {st.name}
      </text>
    </g>
  );
}

/** 광선로 이름표 — `154kV 춘천수력T/L · 24심 · 8.5 km`(이름이 ` / ` 로 여럿이면 첫 이름 + 「…」). */
function lineLabel(l: Pick<MapLine, 'name' | 'coreCount' | 'lengthKm'>): string {
  const [first, ...rest] = l.name.split(' / ');
  return [`${first}${rest.length > 0 ? '…' : ''}`, l.coreCount > 0 ? `${l.coreCount}심` : null, l.lengthKm != null ? kmText(l.lengthKm) : null]
    .filter(Boolean).join(' · ');
}

/**
 * 이름표 자리 — 선 가운데에서 그 가닥이 벌어진 쪽으로 조금 더 나가(평행 가닥끼리 이름표가 겹치지 않게), 선 위에
 * 글자가 얹히지 않도록 바깥쪽에 붙인다(세로에 가까운 선은 옆, 가로에 가까운 선은 위·아래).
 */
function labelPlace(l: Pick<MapLine, 'a' | 'b' | 'lane' | 'lanes'>, a: Pt, b: Pt): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  const [p, q] = l.a < l.b ? [a, b] : [b, a];
  const off = (l.lane - (l.lanes - 1) / 2) * LANE_GAP;
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  const n = { x: -(q.y - p.y) / len, y: (q.x - p.x) / len };
  /* 가닥 하나면 위(또는 오른쪽)로. */
  const dir = off !== 0 ? Math.sign(off) : (n.y < 0 || (n.y === 0 && n.x > 0) ? 1 : -1);
  const out = { x: n.x * dir, y: n.y * dir };
  const m = { x: (a.x + b.x) / 2 + n.x * off + out.x * 6, y: (a.y + b.y) / 2 + n.y * off + out.y * 6 };
  if (Math.abs(out.x) > Math.abs(out.y)) return { x: m.x + (out.x > 0 ? 2 : -2), y: m.y + 4, anchor: out.x > 0 ? 'start' : 'end' };
  return { x: m.x, y: out.y > 0 ? m.y + 12 : m.y - 2, anchor: 'middle' };
}

/**
 * 광선로 한 가닥의 곡선 — 같은 국 쌍의 가닥들은 `lane` 차례대로 양옆으로 벌린다(가닥 하나면 곧은 선).
 * 벌리는 방향은 **국 id 순**으로 정한다 — A·B 가 바뀐 가닥도 같은 쪽으로 벌어지게. `extra` 는 겹쳐 그릴 때 더 벌리는 몫.
 */
export function curvePath(l: Pick<MapLine, 'a' | 'b' | 'lane' | 'lanes'>, a: Pt, b: Pt, extra: number): string {
  const [p, q] = l.a < l.b ? [a, b] : [b, a];
  const off = (l.lane - (l.lanes - 1) / 2) * LANE_GAP + extra;
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  const n = { x: -(q.y - p.y) / len, y: (q.x - p.x) / len };
  const r = (v: number) => Math.round(v * 10) / 10;
  if (l.lanes === 1) {
    /* 곧은 선 — 겹침 벌림만 평행 이동으로. */
    return `M${r(a.x + n.x * extra)} ${r(a.y + n.y * extra)} L${r(b.x + n.x * extra)} ${r(b.y + n.y * extra)}`;
  }
  /* 2차 곡선의 꼭짓점은 조절점의 절반만 나간다 — 꼭짓점이 off 만큼 벌어지게 조절점은 2배. */
  const c = { x: (a.x + b.x) / 2 + n.x * off * 2, y: (a.y + b.y) / 2 + n.y * off * 2 };
  return `M${r(a.x)} ${r(a.y)} Q${r(c.x)} ${r(c.y)} ${r(b.x)} ${r(b.y)}`;
}
