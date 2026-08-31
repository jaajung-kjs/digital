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
import { cn } from '../../../components/ui/cn';
import type { Point, TopoEdge, TopoNode } from '@twin/core';

/** 마디 상자의 폭·높이 어림 — 줄이 상자 테두리에서 시작하도록 잡아 준다. */
const BOX_W = 180;
const BOX_H = 76;
/** 그림 둘레 여백 — 상자가 판 가장자리에 붙지 않게. */
const PAD = 120;

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
  const panelRef = useCallback((node: HTMLDivElement | null) => {
    detachPanel.current?.();
    detachPanel.current = null;
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setPanelSize({ width: box.width, height: box.height });
    });
    ro.observe(node);
    detachPanel.current = () => ro.disconnect();
  }, []);

  /* 축소만 한다(min(1, …)) — 마디 몇 개짜리 작은 그림을 판 크기까지 늘리면 글자만 커질
     뿐 읽을 것은 늘지 않는다. */
  const scale = panelSize
    ? Math.min(1, panelSize.width / width, panelSize.height / height)
    : 1;

  /* 남는 자리를 **양쪽으로 나눈다** — 배율은 한 축만 꽉 채우므로 다른 축에는 반드시 여백이
     남는데, 그것을 그냥 두면 그림이 왼쪽 위로 쏠리고 반대쪽에만 빈 판이 펼쳐진다.
     여백을 숫자로 계산해 두는 까닭은 그래야 시험이 그 값을 그대로 확인할 수 있어서다
     (flex 가운데 맞춤은 jsdom 에 배치가 없어 확인할 길이 없다). 배율이 늘 축소뿐이라
     그림은 판보다 클 수 없다 — 그래도 음수 여백은 막아 둔다. */
  const stage = { width: width * scale, height: height * scale };
  const gutter = panelSize
    ? {
      left: Math.max(0, (panelSize.width - stage.width) / 2),
      top: Math.max(0, (panelSize.height - stage.height) / 2),
    }
    : { left: 0, top: 0 };

  return (
    <div ref={panelRef} className="h-[60vh] overflow-auto rounded-md bg-surface-2">
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
              /* 같은 두 국을 잇는 줄이 여럿이면(이중화) 나란히 벌려 둘로 보이게 한다. */
              const parallel = edges.filter((o) => sameEnds(o, e));
              const offset = (parallel.indexOf(e) - (parallel.length - 1) / 2) * 14;
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
          </svg>

          {nodes.map((node) => {
            const p = at(node.id);
            if (!p) return null;
            /* 마디 = 장비 하나 — 장비 이름 위에 국·설비를 흐리게 붙인다. 층 이름은 core 가
               채워 줬을 때만(그 국에 층이 둘 이상일 때만) 앞에 붙는다. 이름이 길어도
               `break-words` 로 접힐 뿐 `truncate` 로 자르지 않는다 — 「…으로 생략된 경로도
               다 보이게」가 이 화면을 여는 이유다.

               **패치가 끝나는 자리**는 장비가 아니다 — 국을 그냥 지나가도록 이어 놓은 심선의
               끝(성단까지만 오고 장비로 안 나간 슬롯)이다. 그것도 실재하는 연결이라 마디로
               세우되, 테두리를 점선으로 두어 장비와 구별한다. */
            return (
              <div
                key={node.id}
                data-topo-node={node.id}
                data-patch-end={node.isPatchEnd}
                className={cn(
                  'absolute rounded-md border bg-surface px-2.5 py-1.5 shadow-sm',
                  node.isPatchEnd && 'border-dashed',
                  node.isSeed ? 'border-primary' : 'border-line',
                )}
                style={{ left: 0, top: 0, width: BOX_W, transform: `translate(${p.x - BOX_W / 2}px, ${p.y - BOX_H / 2}px)` }}
              >
                <div className={cn(
                  'break-words text-sm font-medium',
                  node.isPatchEnd ? 'text-content-muted' : 'text-content',
                )}>
                  {node.name}
                </div>
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
