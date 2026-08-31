/**
 * TopologyCanvas — **마디는 HTML, 줄만 SVG**.
 *
 * 마디를 SVG 안에 넣으면 글자 줄바꿈·말줄임을 손으로 계산해야 하고, 공용 컴포넌트의 색·
 * 글자 크기가 안 먹는다. 줄은 반대로 HTML 로 그릴 수 없다. 그래서 갈라 놓고, 좌표만 둘이
 * 나눠 쓴다.
 *
 * `@xyflow/react` 는 다시 넣지 않았다. 마디가 수십 개고 조작이 호버뿐이라 쓸 이유가 없다.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type * as React from 'react';
import { cn } from '../../../components/ui/cn';
import type { Point, TopoEdge, TopoNode } from '@twin/core';

/** 마디 상자의 폭·높이 어림 — 줄이 상자 테두리에서 시작하도록 잡아 준다. */
const BOX_W = 180;
const BOX_H = 76;
/** 그림 둘레 여백 — 상자가 판 가장자리에 붙지 않게. */
const PAD = 120;
/** 같은 두 마디를 잇는 줄끼리 벌리는 폭 — 그림이 줄어도 두 줄로 읽힐 만큼. */
const PARALLEL_GAP = 34;

interface TopologyCanvasProps {
  nodes: TopoNode[];
  edges: TopoEdge[];
  litEdgeIds: Set<string>;
  positions: Map<string, Point>;
}

export function TopologyCanvas({ nodes, edges, litEdgeIds, positions }: TopologyCanvasProps) {
  /* 좌표를 판 안으로 옮긴다 — core 는 원점을 가운데 두고 음수도 낸다. */
  const { shift, width, height } = useMemo(() => {
    const pts = [...positions.values()];
    if (pts.length === 0) return { shift: { x: PAD, y: PAD }, width: PAD * 2, height: PAD * 2 };
    const minX = Math.min(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxX = Math.max(...pts.map((p) => p.x));
    const maxY = Math.max(...pts.map((p) => p.y));
    return {
      shift: { x: PAD - minX, y: PAD - minY },
      width: maxX - minX + PAD * 2,
      height: maxY - minY + PAD * 2,
    };
  }, [positions]);

  const at = (id: string): Point | null => {
    const p = positions.get(id);
    return p ? { x: p.x + shift.x, y: p.y + shift.y } : null;
  };

  /* 판 크기를 재서 그림을 거기 맞춘다 — 링이 커져도 스크롤 없이 한눈에 들어오게. 못 재면
     (시험 환경처럼 요소 크기가 0) 배율은 그냥 1이다. §1.7-q: 관찰은 이 판이 붙고 뗄 때마다
     ref 콜백이 스스로 챙긴다 — useEffect(,[]) 는 처음 한 번뿐이라 조건부로 나타나는 판을
     놓친다. */
  const [panelSize, setPanelSize] = useState<{ width: number; height: number } | null>(null);
  const detachPanel = useRef<(() => void) | null>(null);
  /* 판 자체는 **옮긴 몫에 안 흔들린다** — 확대 기준을 여기서 잰다(아래 `onWheel` 참조). */
  const panelEl = useRef<HTMLDivElement | null>(null);
  const panelRef = useCallback((node: HTMLDivElement | null) => {
    detachPanel.current?.();
    detachPanel.current = null;
    panelEl.current = node;
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setPanelSize({ width: box.width, height: box.height });
    });
    ro.observe(node);
    detachPanel.current = () => ro.disconnect();
  }, []);

  /* 축소만 한다(min(1, …)) — 마디 몇 개짜리 작은 그림을 판 크기까지 늘리면 글자만 커질
     뿐 읽을 것은 늘지 않는다. 이것이 **처음 보이는 배율**이고, 사람이 손으로 키운 몫은
     따로 곱한다. */
  const fit = panelSize
    ? Math.min(1, panelSize.width / width, panelSize.height / height)
    : 1;

  /* 사람이 키운 몫과 끌어 옮긴 몫 — 그림이 바뀌면(다른 포트에서 다시 열면) 처음으로 되돌린다.
     키를 좌표에서 뽑는 까닭은 마디 수만 세면 다른 망인데 같은 수일 때 안 되돌아가기 때문이다. */
  const graphKey = `${positions.size}:${width}x${height}`;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const shown = useRef(graphKey);
  if (shown.current !== graphKey) {
    shown.current = graphKey;
    if (zoom !== 1) setZoom(1);
    if (pan.x !== 0 || pan.y !== 0) setPan({ x: 0, y: 0 });
  }
  const scale = fit * zoom;

  /* 휠은 **가리키는 자리를 붙든 채** 키운다 — 가운데를 기준으로 키우면 보고 있던 곳이
     화면 밖으로 밀려나 매번 다시 찾아야 한다.

     가리킨 자리를 그림 좌표로 되돌린 뒤(`/scale`), 새 배율에서 그 점이 같은 화면 자리에
     오도록 옮긴 몫을 다시 푼다. 기준으로 삼는 것은 **여백 상자**다 — 여백은 처음 맞춘 배율로
     고정돼 있어(아래 `fit`) 키워도 안 움직이므로, 그것을 기준 삼아야 계산이 흔들리지 않는다. */
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const box = panelEl.current?.getBoundingClientRect();
    if (!box) return;
    const next = Math.min(4, Math.max(1, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    if (next === zoom) return;
    /* 기준은 **판**에서 잰다. 여백 상자는 옮긴 몫(pan) 안에 들어 있어 이미 그만큼 움직여
       있으므로, 거기서 재고 pan 을 또 빼면 두 번 세어 굴릴 때마다 기준이 밀린다
       (사용자: 「실시간으로 계속 확대 기준값이 바뀌니까 어색하다」). */
    const at = { x: e.clientX - box.left - gutter.left, y: e.clientY - box.top - gutter.top };
    const inFigure = { x: (at.x - pan.x) / scale, y: (at.y - pan.y) / scale };
    const nextScale = fit * next;
    setZoom(next);
    setPan({ x: at.x - inFigure.x * nextScale, y: at.y - inFigure.y * nextScale });
  };

  /* 끌어 옮기기 — 키운 뒤에는 판 밖으로 나간 데를 볼 길이 이것뿐이다. */
  const drag = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
  };
  const endDrag = () => { drag.current = null; };

  /* 남는 자리를 **양쪽으로 나눈다** — 배율은 한 축만 꽉 채우므로 다른 축에는 반드시 여백이
     남는데, 그것을 그냥 두면 그림이 왼쪽 위로 쏠리고 반대쪽에만 빈 판이 펼쳐진다.
     여백을 숫자로 계산해 두는 까닭은 그래야 시험이 그 값을 그대로 확인할 수 있어서다
     (flex 가운데 맞춤은 jsdom 에 배치가 없어 확인할 길이 없다). 배율이 늘 축소뿐이라
     그림은 판보다 클 수 없다 — 그래도 음수 여백은 막아 둔다. */
  /* 여백은 **처음 맞춘 배율(fit)** 로만 잡는다 — 손으로 키운 몫까지 넣으면 키우는 순간
     상자 크기와 여백이 함께 다시 계산돼 그림이 통째로 튄다(실제로 그랬다). 키운 몫은
     여백을 건드리지 않고 옮긴 몫(pan)으로만 표현한다. */
  const stage = { width: width * fit, height: height * fit };
  const gutter = panelSize
    ? {
      left: Math.max(0, (panelSize.width - stage.width) / 2),
      top: Math.max(0, (panelSize.height - stage.height) / 2),
    }
    : { left: 0, top: 0 };

  return (
    <div
      ref={panelRef}
      className={cn('relative h-[60vh] overflow-hidden rounded-md bg-surface-2',
        zoom > 1 ? 'cursor-grab active:cursor-grabbing' : '')}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* 키운 몫을 되돌리는 자리 — 끌다 길을 잃으면 여기서 처음으로 돌아온다. */}
      {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
        <button
          type="button"
          className="absolute right-2 top-2 z-10 rounded border border-line bg-surface px-2 py-1 text-xs text-content-muted shadow-sm"
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
        >
          맞춰 보기
        </button>
      )}
      <div style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
      {/* 바깥 상자는 축소된 크기만큼만 차지한다 — 그래야 스크롤 판정(overflow)이 줄어든
          그림을 보고 판단하지, 원래 크기를 보고 판단해 스크롤바가 남지 않는다. */}
      <div
        data-topo-gutter
        style={{ width: stage.width, height: stage.height, marginLeft: gutter.left, marginTop: gutter.top }}
      >
        <div
          data-topo-stage
          className="relative"
          style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
          <svg className="absolute left-0 top-0" width={width} height={height}>
            {edges.map((e, i) => {
              const a = at(e.source);
              const b = at(e.target);
              if (!a || !b) return null;
              const lit = litEdgeIds.has(e.id);
              /* 같은 두 마디를 잇는 줄이 여럿이면(이중화) 나란히 벌려 둘로 보이게 한다.
                 벌림은 마디 사이 거리에 비례해 잡는다 — 상수로 두면 그림이 줄어들 때 함께
                 줄어들어 두 줄이 한 줄처럼 붙어 보인다(0.74배에서 14px → 화면 10px). */
              const parallel = edges.filter((o) => sameEnds(o, e));
              const offset = (parallel.indexOf(e) - (parallel.length - 1) / 2) * PARALLEL_GAP;
              const [p, q] = shifted(edgeAt(a, b), offset);
              return (
                <line
                  key={e.id ?? i}
                  x1={p.x} y1={p.y} x2={q.x} y2={q.y}
                  data-lit={lit}
                  strokeWidth={lit ? 3 : 1.5}
                  className={lit ? 'stroke-primary' : 'stroke-line'}
                >
                  <title>{`${e.sourcePortName} ↔ ${e.targetPortName}`}</title>
                </line>
              );
            })}
            {/* **패치로 지나간 국**은 줄 위에 작게 적는다 — 그 국은 장비를 안 거쳤으니 마디가
                아니지만, 「이 길은 저기를 거쳐 간다」는 사실은 남아야 한다. 지나간 국이 없는
                줄에는 아무것도 안 적는다(다 적으면 그림이 글자로 덮인다). */}
            {edges.filter((e) => e.viaSubstationNames.length > 0).map((e) => {
              const a = at(e.source);
              const b = at(e.target);
              if (!a || !b) return null;
              return (
                <text
                  key={`t-${e.id}`}
                  x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6}
                  textAnchor="middle"
                  className="fill-content-muted text-xs"
                >
                  {`${e.viaSubstationNames.join(' · ')} (패치)`}
                </text>
              );
            })}
          </svg>

          {nodes.map((node) => {
            const p = at(node.id);
            if (!p) return null;
            /* 마디 = 장비 하나 — 장비 이름 위에 국·설비를 흐리게 붙인다. 층 이름은 core 가
               채워 줬을 때만(그 국에 층이 둘 이상일 때만) 앞에 붙는다. 이름이 길어도
               `break-words` 로 접힐 뿐 `truncate` 로 자르지 않는다 — 「…으로 생략된 경로도
               다 보이게」가 이 화면을 여는 이유다.
 */
            return (
              <div
                key={node.id}
                data-topo-node={node.id}
                className={cn(
                  'absolute rounded-md border bg-surface px-2.5 py-1.5 shadow-sm',
                  node.isSeed ? 'border-primary' : 'border-line',
                )}
                style={{ left: 0, top: 0, width: BOX_W, transform: `translate(${p.x - BOX_W / 2}px, ${p.y - BOX_H / 2}px)` }}
              >
                <div className="break-words text-sm font-medium text-content">{node.name}</div>
                <div className="break-words text-xs text-content-muted">
                  {node.floorName ? `[${node.floorName}] ` : ''}
                  {node.substationName}
                  {node.assemblyName ? ` · ${node.assemblyName}` : ''}
                </div>
              </div>
            );
          })}
        </div>
        </div>
      </div>
    </div>
  );
}

const sameEnds = (a: TopoEdge, b: TopoEdge) =>
  (a.source === b.source && a.target === b.target) || (a.source === b.target && a.target === b.source);

/** 줄은 상자 **테두리**에서 시작한다 — 중심에서 그으면 글자를 가로지른다. */
function edgeAt(a: Point, b: Point): [Point, Point] {
  const clip = (from: Point, to: Point): Point => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (dx === 0 && dy === 0) return from;
    const tx = dx === 0 ? Infinity : (BOX_W / 2) / Math.abs(dx);
    const ty = dy === 0 ? Infinity : (BOX_H / 2) / Math.abs(dy);
    const t = Math.min(tx, ty);
    return { x: from.x + dx * t, y: from.y + dy * t };
  };
  return [clip(a, b), clip(b, a)];
}

/** 줄을 제 방향의 수직으로 `d` 만큼 옮긴다 — 평행 줄을 갈라 놓는 데 쓴다. */
function shifted([p, q]: [Point, Point], d: number): [Point, Point] {
  if (d === 0) return [p, q];
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  const nx = -(q.y - p.y) / len * d;
  const ny = (q.x - p.x) / len * d;
  return [{ x: p.x + nx, y: p.y + ny }, { x: q.x + nx, y: q.y + ny }];
}
