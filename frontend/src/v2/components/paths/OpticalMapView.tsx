import { useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { OpticalPath } from '@twin/core';
import { Button, EmptyState, IconButton, PageState, StatusBar, StatusItem, ViewCard } from '../../../components/ui';
import { useNetwork } from '../../model/networkApi';
import { useWorkingCopy } from '../../model/store/workingCopy';
import { effectiveNetwork } from './networkSelectors';
import { OpticalMap, useMapViewport } from './OpticalMap';
import { dutyAttr, DutyLegend, dutyOrder } from './duty';
import { buildOpticalMap, overlayFor, type MapLine } from './opticalMapModel';
import { PathPanel, warningKey } from './PathPanel';
import { PathTraceDialog } from './PathTraceDialog';
import { BREAK_TEXT } from './pathChain';

export interface OpticalMapViewProps {
  /** 지사·본부 노드 — 범위. */
  nodeId: string;
  /** 국 마디를 누르면 — 그 국 현황으로. */
  onOpenStation: (substationId: string) => void;
  /** 광선로를 누르면 — 그 국(범위 안 끝) 선번장의 그 블록으로. */
  onOpenLine: (substationId: string, block: { lineId: string; side: 'A' | 'B' }) => void;
}

const toggle = <T,>(set: ReadonlySet<T>, v: T): Set<T> => {
  const next = new Set(set);
  if (next.has(v)) next.delete(v); else next.add(v);
  return next;
};
/** 상태줄 수 칸은 줄지 않고 줄을 바꾸지 않는다 — 이 판에서만(범례가 길다). */
const KEEP = 'shrink-0 whitespace-nowrap';
const NONE = { bundles: new Set<string>(), rings: new Set<string>(), warnings: new Set<string>() };

/**
 * 광 계통도 — 지사·본부 범위의 국과 광선로, 그 위에 고른 회선의 중계경로(주회선 실선 · 예비회선 점선 · 주/예비 미지정 옅은 강조색).
 * 오른쪽은 이중화 경고 · 링 · 회선(`PathPanel`). 범위 데이터 위에 **저장 전 변경**을 겹친다(`effectiveNetwork`).
 *
 * 고른 회선은 보는 방식이라 주소에 담지 않는다(§3.3) — 판(`?view=광 계통도`)만 주소가 쥔다.
 */
export function OpticalMapView({ nodeId, onOpenStation, onOpenLine }: OpticalMapViewProps) {
  const net = useNetwork(nodeId);
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const view = useMemo(() => (net.data ? effectiveNetwork(net.data, { saved, overlays }) : null), [net.data, saved, overlays]);
  const model = useMemo(() => (view ? buildOpticalMap(view, net.data) : null), [view, net.data]);
  const key = useMemo(() => (model ? `${nodeId}:${model.stations.map((s) => s.id).join(',')}` : nodeId), [model, nodeId]);
  const vp = useMapViewport({ positions: model?.positions ?? new Map(), key });

  const [picked, setPicked] = useState(NONE);
  const [query, setQuery] = useState('');
  /* 경로 미완결 줄에서 연 중계경로 추적 — 끊긴 자리로 가는 길이 그 창에 있다. */
  const [tracing, setTracing] = useState<OpticalPath | null>(null);
  /* 범위가 바뀌면 고른 것은 놓는다 — 다른 범위에 없는 회선이다. */
  const [pickedFor, setPickedFor] = useState(nodeId);
  if (pickedFor !== nodeId) { setPickedFor(nodeId); setPicked(NONE); setQuery(''); }

  const lit = useMemo(() => {
    if (!model) return { bundles: new Set<string>(), warned: new Set<string>() };
    const bundles = new Set(picked.bundles);
    for (const r of model.rings) if (picked.rings.has(r.id)) r.bundleIds.forEach((id) => bundles.add(id));
    const warned = new Set<string>();
    for (const w of model.warnings) {
      if (!picked.warnings.has(warningKey(w))) continue;
      bundles.add(w.mainBundle); bundles.add(w.backupBundle);
      w.sharedLineIds.forEach((id) => warned.add(id));
    }
    return { bundles, warned };
  }, [model, picked]);
  const pickedCount = picked.bundles.size + picked.rings.size + picked.warnings.size;
  const overlay = useMemo(() => overlayFor(model?.bundles ?? [], lit.bundles), [model, lit.bundles]);

  if (net.isError) {
    return <PageState error="광 계통도를 불러오지 못했습니다" action={<Button variant="secondary" size="sm" onClick={() => void net.refetch()}>다시 시도</Button>} />;
  }
  if (!view || !model) return <PageState />;
  if (model.lines.length === 0) {
    return <EmptyState title="이 범위에 등록된 광선로가 없습니다" description="변전소 선번장에서 「광선로 추가」로 등록하세요." />;
  }

  const openLine = (l: MapLine) => {
    const inScope = (id: string) => model.stations.find((s) => s.id === id)?.inScope ?? false;
    const side = inScope(l.a) || !inScope(l.b) ? 'A' : 'B';
    onOpenLine(side === 'A' ? l.a : l.b, { lineId: l.id, side });
  };

  /* 범례 — 이 범위에 실제로 있는 것만(§3.4). */
  const duties = [...new Set(model.bundles.map((b) => b.duty))].sort((x, y) => dutyOrder(x) - dutyOrder(y));
  const outside = model.stations.some((s) => !s.inScope);

  const status = (
    <StatusBar>
      {/* 줄지 않는다 — 범례가 3개로 늘면 1280 에서 「광선/로」처럼 세로로 쪼개졌다(범례만 잘린다). */}
      <StatusItem label="국" className={KEEP}>{model.stations.length}</StatusItem>
      <StatusItem label="광선로" className={KEEP}>{model.lines.length}</StatusItem>
      <StatusItem label="회선" className={KEEP}>{model.bundles.length}</StatusItem>
      {/* 범례는 좁으면 잘린다(글자를 세로로 쪼개지 않는다) — 수·확대 단추가 먼저다. */}
      <span className="flex min-w-0 items-center gap-3 overflow-hidden whitespace-nowrap px-3" data-testid="map-legend">
        {duties.map((d) => <DutyLegend key={dutyAttr(d)} duty={d} />)}
        {outside && <span className="flex shrink-0 items-center gap-1.5"><svg width="12" height="12" aria-hidden className="opacity-50"><circle cx="6" cy="6" r="4" className="fill-surface stroke-content" strokeWidth={1.5} strokeDasharray="3 2" /></svg>범위 밖 국</span>}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-0.5">
        <IconButton aria-label="축소" size="sm" onClick={vp.zoomOut}><Minus size={14} /></IconButton>
        <span className="min-w-10 text-center tabular-nums text-content">{Math.round(vp.viewport.zoom)}%</span>
        <IconButton aria-label="확대" size="sm" onClick={vp.zoomIn}><Plus size={14} /></IconButton>
        <Button variant="ghost" size="xs" title="국 전체에 맞추기" onClick={vp.refit}>맞추기</Button>
      </span>
    </StatusBar>
  );

  return (
    <>
      <ViewCard
        body="fill"
        tools={model.truncated
          ? <span role="status" className="truncate text-xs text-warning">{BREAK_TEXT.truncated} — 범위 밖으로 멀리 이어지는 회선은 끝까지 그리지 않았습니다</span>
          : <span className="truncate text-xs text-content-muted">회선을 선택하면 지나는 광선로가 표시됩니다</span>}
        /* 고른 것을 놓는 단추는 그림의 머리 — 고른 것은 그림 위에 겹쳐 있다. */
        actions={pickedCount > 0 ? (
          <>
            <span className="whitespace-nowrap text-xs text-content-muted">{pickedCount}개 선택</span>
            <Button variant="secondary" size="xs" onClick={() => setPicked(NONE)}>선택 해제</Button>
          </>
        ) : undefined}
        status={status}
      >
        <OpticalMap
          model={model}
          viewport={vp.viewport}
          setViewport={vp.setViewport}
          boxRef={vp.attach}
          overlay={overlay}
          warned={lit.warned}
          onStation={onOpenStation}
          onLine={openLine}
        />
      </ViewCard>
      <aside className="flex h-full w-[364px] shrink-0 flex-col">
        <PathPanel
          view={view}
          model={model}
          query={query}
          onQuery={setQuery}
          picked={picked}
          onBundle={(id) => setPicked((p) => ({ ...p, bundles: toggle(p.bundles, id) }))}
          onBundles={(ids, yes) => setPicked((p) => {
            const next = new Set(p.bundles);
            for (const id of ids) { if (yes) next.add(id); else next.delete(id); }
            return { ...p, bundles: next };
          })}
          onIncomplete={setTracing}
          onRing={(r) => setPicked((p) => ({ ...p, rings: toggle(p.rings, r.id) }))}
          onWarning={(w) => setPicked((p) => ({ ...p, warnings: toggle(p.warnings, warningKey(w)) }))}
        />
      </aside>
      {tracing && tracing.hops[0] && (
        <PathTraceDialog
          substationId={(tracing.start ?? tracing.end)?.substationId ?? model.lines.find((l) => l.id === tracing.hops[0]!.lineId)?.a ?? nodeId}
          at={{ lineId: tracing.hops[0].lineId, coreNo: tracing.hops[0].coreNo, side: tracing.hops[0].from }}
          onClose={() => setTracing(null)}
        />
      )}
    </>
  );
}
