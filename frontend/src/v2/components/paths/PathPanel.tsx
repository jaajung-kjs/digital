import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { CORE_ROLES, coreRoleCircuitLabel, type OpticalPath, type PathBundle } from '@twin/core';
import { Button, DetailCard, DetailCardHeader, IconButton, ListRow, SELECTED, TableSearch } from '../../../components/ui';
import { DutyBadge } from './duty';
import type { NetworkView } from './networkSelectors';
import { equipmentLabel, lineName, type OpticalMapModel, type Ring, type Warning } from './opticalMapModel';
import { BREAK_TEXT, breakCause, pathSummary, shortStationName } from './pathChain';

export const warningKey = (w: Warning) => `${w.mainBundle}~${w.backupBundle}`;

/**
 * 회선 줄의 첫 줄 — 설비 이름 + 양끝 국(`RTU 광스위치 · 북춘천 ↔ 철원`). 국마다 같은 이름의 설비가 있어 국이 있어야 갈린다.
 * 설비 이름이 다르면 둘 다(`I-MUX(B) ↔ I-MUX(북춘천-춘천H/P) · 북춘천 ↔ 춘천HP`).
 */
export function bundleTitle(view: NetworkView, b: PathBundle): string {
  const [a, z] = [view.equipmentName(b.a.equipmentId) ?? '—', view.equipmentName(b.b.equipmentId) ?? '—'];
  const [sa, sz] = [shortStationName(view.substationName(b.a.substationId)), shortStationName(view.substationName(b.b.substationId))];
  return `${a === z ? a : `${a} ↔ ${z}`} · ${sa === sz ? sa : `${sa} ↔ ${sz}`}`;
}
/** 중계경로 현장 표기 — 묶음의 경로 모두(Tx/Rx 면 `북춘천(OFD:1·2)-춘천HP`). */
function summary(view: NetworkView, model: OpticalMapModel, b: PathBundle): string {
  return pathSummary(view, model.pathsOf.get(b.id) ?? []);
}
/** 회선 검색 — 설비 이름·국 이름·중계경로 표기에서. */
export function filterBundles(view: NetworkView, model: OpticalMapModel, query: string): PathBundle[] {
  const q = query.trim().toLowerCase();
  if (!q) return model.bundles;
  return model.bundles.filter((b) => [bundleTitle(view, b), summary(view, model, b), equipmentLabel(view, b.a), equipmentLabel(view, b.b)].some((t) => t.toLowerCase().includes(q)));
}

export interface PathPanelProps {
  view: NetworkView;
  model: OpticalMapModel;
  /** 회선 목록 검색어 — 회선 카드 머리의 검색 상자. */
  query: string;
  onQuery: (q: string) => void;
  picked: { bundles: ReadonlySet<string>; rings: ReadonlySet<string>; warnings: ReadonlySet<string> };
  onBundle: (id: string) => void;
  /** 주회선 전체 · 예비회선 전체 — 그 주/예비의 회선을 모두 고른다(이미 모두 골랐으면 놓는다). */
  onBundles: (ids: string[], on: boolean) => void;
  onRing: (ring: Ring) => void;
  onWarning: (w: Warning) => void;
  /** 경로 미완결 줄 — 그 경로의 중계경로 추적을 연다(끊긴 자리로 가는 길이 거기 있다). */
  onIncomplete: (p: OpticalPath) => void;
}

/**
 * 광 계통도 오른쪽 — **이중화 경고 · 링 · 경로 미완결 · 회선** 네 절(한 절 = 한 카드, §3.2). 줄을 누르면 그것이 지나는
 * 광선로가 그림 위에 겹친다(여럿 함께 고를 수 있다, 다시 누르면 놓는다). 판정은 core(`rings`·`redundancyWarnings`)이고
 * 여기는 줄을 세울 뿐이다.
 */
export function PathPanel({ view, model, query, onQuery, picked, onBundle, onBundles, onRing, onWarning, onIncomplete }: PathPanelProps) {
  const [openIncomplete, setOpenIncomplete] = useState(true);
  const byId = new Map(model.bundles.map((b) => [b.id, b]));
  const name = (id: string) => model.lines.find((l) => l.id === id)?.name ?? lineName(view, id);
  const shown = filterBundles(view, model, query);
  /* 주/예비가 하나도 지정되지 않으면 이중화는 판정할 수 없다 — 0 을 「이상 없음」으로 보이지 않는다. */
  const judged = model.bundles.some((b) => b.duty !== null);
  const on = (yes: boolean) => (yes ? { 'aria-current': true as const, className: SELECTED } : {});
  const broken = model.incomplete.length;

  /* 같은 설비 쌍에 광선로가 다른 회선이 또 있으면(평행 가닥) 메타에 광선로 이름을 적는다 — 수만으로는 갈리지 않는다. */
  const pairKey = (b: PathBundle) => [b.a.equipmentId, b.b.equipmentId].sort().join('|');
  const routes = new Map<string, Set<string>>();
  for (const b of model.bundles) routes.set(pairKey(b), (routes.get(pairKey(b)) ?? new Set()).add(b.lineIds.join('>')));
  const bundleMeta = (b: PathBundle) => {
    const route = (routes.get(pairKey(b))?.size ?? 0) > 1 ? b.lineIds.map(name).join(' → ') : `광선로 ${b.lineIds.length}개`;
    return [summary(view, model, b), route].filter(Boolean).join(' · ');
  };

  /* 빠른 선택 — 이 범위에 있는 주/예비만. */
  const quick = CORE_ROLES.map((r) => r.value).flatMap((duty) => {
    const ids = model.bundles.filter((b) => b.duty === duty).map((b) => b.id);
    return ids.length > 0 ? [{ duty, ids, all: ids.every((id) => picked.bundles.has(id)) }] : [];
  });

  return (
    /* 경고·링·미완결은 서 있고(각자 상한까지만 자라 제 안에서 구른다) 회선 카드가 남은 높이를 갖는다 — 그 줄만 구른다(§1.7-b). */
    <div className="flex min-h-0 flex-1 flex-col gap-3" data-testid="path-panel">
      <DetailCard className="shrink-0">
        <DetailCardHeader
          title="이중화 경고"
          badge={judged ? model.warnings.length : undefined}
          badgeStatus={model.warnings.length > 0 ? 'warning' : 'neutral'}
        />
        <div data-testid="warning-list" className="max-h-40 overflow-y-auto">
          {!judged ? (
            <ListRow meta="선번장 코어에 주/예비를 지정하면 나타납니다" className="text-content-muted">주/예비가 지정된 회선이 없어 판정할 수 없습니다</ListRow>
          ) : model.warnings.length === 0 ? (
            <ListRow className="text-content-muted">주/예비회선이 같은 광선로를 지나는 곳이 없습니다</ListRow>
          ) : model.warnings.map((w) => {
            const main = byId.get(w.mainBundle);
            const names = w.sharedLineIds.map(name).join(' · ');
            return (
              <ListRow
                key={warningKey(w)}
                onClick={() => onWarning(w)}
                trailing={`광선로 ${w.sharedLineIds.length}개`}
                meta={`주/예비회선이 같은 광선로를 지납니다 — ${names}`}
                title={`주/예비회선이 같은 광선로를 지납니다 — ${names}`}
                {...on(picked.warnings.has(warningKey(w)))}
              >
                {main ? `${equipmentLabel(view, main.a)} ↔ ${equipmentLabel(view, main.b)}` : '—'}
              </ListRow>
            );
          })}
        </div>
      </DetailCard>

      <DetailCard className="shrink-0">
        <DetailCardHeader title="링" badge={model.rings.length} />
        <div data-testid="ring-list" className="max-h-32 overflow-y-auto">
          {model.rings.length === 0 ? (
            /* 미완결 경로가 있으면 「링이 없다」고 단정하지 않는다 — 끊긴 사슬이 이어지면 링이 될 수 있다. */
            <ListRow className="text-content-muted">
              {broken > 0 ? `완결된 회선으로는 링이 나타나지 않습니다 (경로 미완결 ${broken})` : '이 범위의 회선은 링을 이루지 않습니다'}
            </ListRow>
          ) : model.rings.map((r) => {
            const names = r.equipmentIds.map((id) => {
              const end = model.bundles.flatMap((b) => [b.a, b.b]).find((e) => e.equipmentId === id);
              return end ? equipmentLabel(view, end) : (view.equipmentName(id) ?? '—');
            }).join(' · ');
            return (
              <ListRow key={r.id} onClick={() => onRing(r)} trailing={`회선 ${r.bundleIds.length}개`} title={names} {...on(picked.rings.has(r.id))}>
                {names}
              </ListRow>
            );
          })}
        </div>
      </DetailCard>

      {broken > 0 && (
        <DetailCard className="shrink-0">
          <DetailCardHeader
            title="경로 미완결"
            badge={broken}
            badgeStatus="warning"
            actions={(
              <IconButton
                size="sm"
                aria-expanded={openIncomplete}
                aria-label={openIncomplete ? '경로 미완결 접기' : '경로 미완결 펼치기'}
                title={openIncomplete ? '접기' : '펼치기'}
                onClick={() => setOpenIncomplete((v) => !v)}
              >
                {openIncomplete ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </IconButton>
            )}
          />
          {openIncomplete && (
            <div data-testid="incomplete-list" className="max-h-32 overflow-y-auto">
              {model.incomplete.map((p) => {
                const end = p.start ?? p.end;
                const cause = BREAK_TEXT[breakCause(view, p, p.start ? 'end' : 'start')];
                const label = end ? `${equipmentLabel(view, end)}${end.port ? ` · ${end.port}` : ''}` : '—';
                const meta = `${pathSummary(view, p)} · ${cause}`;
                return (
                  <ListRow key={p.id} onClick={() => onIncomplete(p)} meta={meta} title={`${label} — ${meta} · 중계경로 보기`}>
                    {label}
                  </ListRow>
                );
              })}
            </div>
          )}
        </DetailCard>
      )}

      <DetailCard className="flex min-h-0 flex-1 flex-col">
        <DetailCardHeader
          title="회선"
          badge={model.bundles.length}
          actions={(
            <>
              <TableSearch value={query} onChange={onQuery} placeholder="설비 · 국 검색" aria-label="회선 검색" shown={shown.length} total={model.bundles.length} className="w-28" />
              {quick.map((q) => (
                <Button key={q.duty} variant={q.all ? 'secondary' : 'ghost'} size="xs" aria-pressed={q.all} onClick={() => onBundles(q.ids, !q.all)}>
                  {coreRoleCircuitLabel(q.duty)} 전체
                </Button>
              ))}
            </>
          )}
        />
        <div data-testid="bundle-list" className="min-h-0 flex-1 overflow-y-auto">
          {model.bundles.length === 0 ? (
            <ListRow className="text-content-muted">완결된 회선이 없습니다</ListRow>
          ) : shown.length === 0 ? (
            <ListRow className="text-content-muted">검색 결과가 없습니다</ListRow>
          ) : shown.map((b) => {
            const title = bundleTitle(view, b);
            const meta = bundleMeta(b);
            return (
              <ListRow
                key={b.id}
                onClick={() => onBundle(b.id)}
                meta={meta}
                trailing={<DutyBadge duty={b.duty} />}
                title={`${title} — ${meta}`}
                {...on(picked.bundles.has(b.id))}
              >
                {title}
              </ListRow>
            );
          })}
        </div>
      </DetailCard>
    </div>
  );
}
