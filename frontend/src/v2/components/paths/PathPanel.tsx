import type { PathBundle } from '@twin/core';
import { Button, cn, DetailCard, DetailCardHeader, ListRow, SELECTED, TableSearch } from '../../../components/ui';
import type { NetworkView } from './networkSelectors';
import { equipmentLabel, type OpticalMapModel, type Ring, type Warning } from './opticalMapModel';
import { pathSummary } from './pathChain';

/** 코어의 주/예비 값 → 화면 말. 사용자 권한 role 이 아니다. */
export const ROLE_LABEL = { main: '주회선', backup: '예비회선', none: '주/예비 미지정' } as const;
export const roleKey = (r: PathBundle['role']): keyof typeof ROLE_LABEL => r ?? 'none';

export const warningKey = (w: Warning) => `${w.mainBundle}~${w.backupBundle}`;

/** 양끝 설비 이름 — 같으면 한 번(`송변전광단말장치`), 다르면 `I-MUX(B) ↔ I-MUX(북춘천-춘천H/P)`. */
function ends(view: NetworkView, b: PathBundle): string {
  const [a, z] = [view.equipmentName(b.a.equipmentId) ?? '—', view.equipmentName(b.b.equipmentId) ?? '—'];
  return a === z ? a : `${a} ↔ ${z}`;
}
/** 중계경로 현장 표기 — 묶음의 첫 경로(`북춘천-(9)-춘천HP`). */
function summary(view: NetworkView, model: OpticalMapModel, b: PathBundle): string {
  const p = model.pathOf.get(b.id);
  return p ? pathSummary(view, p) : '';
}
/** 회선 검색 — 설비 이름·국 이름·중계경로 표기에서. */
export function filterBundles(view: NetworkView, model: OpticalMapModel, query: string): PathBundle[] {
  const q = query.trim().toLowerCase();
  if (!q) return model.bundles;
  return model.bundles.filter((b) => [ends(view, b), summary(view, model, b), equipmentLabel(view, b.a), equipmentLabel(view, b.b)].some((t) => t.toLowerCase().includes(q)));
}

export interface PathPanelProps {
  view: NetworkView;
  model: OpticalMapModel;
  /** 회선 목록 검색어 — 회선 카드 머리의 검색 상자. */
  query: string;
  onQuery: (q: string) => void;
  picked: { bundles: ReadonlySet<string>; rings: ReadonlySet<string>; warnings: ReadonlySet<string> };
  onBundle: (id: string) => void;
  onRing: (ring: Ring) => void;
  onWarning: (w: Warning) => void;
  onClear: () => void;
}

/**
 * 광 계통도 오른쪽 — **이중화 경고 · 링 · 회선** 세 절(한 절 = 한 카드, §3.2). 줄을 누르면 그것이 지나는 광선로가
 * 그림 위에 겹친다(여럿 함께 고를 수 있다, 다시 누르면 놓는다). 판정은 core(`rings`·`redundancyWarnings`)이고
 * 여기는 줄을 세울 뿐이다.
 */
export function PathPanel({ view, model, query, onQuery, picked, onBundle, onRing, onWarning, onClear }: PathPanelProps) {
  const byId = new Map(model.bundles.map((b) => [b.id, b]));
  const lineName = (id: string) => model.lines.find((l) => l.id === id)?.name ?? view.line(id)?.name ?? '—';
  const shown = filterBundles(view, model, query);
  const any = picked.bundles.size + picked.rings.size + picked.warnings.size > 0;
  /* 주/예비가 하나도 지정되지 않으면 이중화는 판정할 수 없다 — 0 을 「이상 없음」으로 보이지 않는다. */
  const judged = model.bundles.some((b) => b.role !== null);
  const on = (yes: boolean) => (yes ? { 'aria-current': true as const, className: SELECTED } : {});

  return (
    /* 경고·링은 서 있고(각자 상한까지만 자라 제 안에서 구른다) 회선 카드가 남은 높이를 갖는다 — 그 줄만 구른다(§1.7-b). */
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
            <ListRow className="text-content-muted">주·예비회선이 같은 광선로를 지나는 곳이 없습니다</ListRow>
          ) : model.warnings.map((w) => {
            const main = byId.get(w.mainBundle);
            const names = w.sharedLineIds.map(lineName).join(' · ');
            return (
              <ListRow
                key={warningKey(w)}
                onClick={() => onWarning(w)}
                trailing={`광선로 ${w.sharedLineIds.length}`}
                meta={`주·예비회선이 같은 광선로를 지납니다 — ${names}`}
                title={`주·예비회선이 같은 광선로를 지납니다 — ${names}`}
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
            <ListRow className="text-content-muted">이 범위의 회선은 링을 이루지 않습니다</ListRow>
          ) : model.rings.map((r) => {
            const names = r.equipmentIds.map((id) => {
              const end = model.bundles.flatMap((b) => [b.a, b.b]).find((e) => e.equipmentId === id);
              return end ? equipmentLabel(view, end) : (view.equipmentName(id) ?? '—');
            }).join(' · ');
            return (
              <ListRow key={r.id} onClick={() => onRing(r)} trailing={`회선 ${r.bundleIds.length}`} title={names} {...on(picked.rings.has(r.id))}>
                {names}
              </ListRow>
            );
          })}
        </div>
      </DetailCard>

      <DetailCard className="flex min-h-0 flex-1 flex-col">
        <DetailCardHeader
          title="회선"
          badge={model.bundles.length}
          actions={(
            <>
              <TableSearch value={query} onChange={onQuery} placeholder="설비 · 국 검색" aria-label="회선 검색" shown={shown.length} total={model.bundles.length} count="inside" className="w-40" />
              {any && <Button variant="secondary" size="sm" onClick={onClear}>선택 해제</Button>}
            </>
          )}
        />
        <div data-testid="bundle-list" className="min-h-0 flex-1 overflow-y-auto">
          {model.bundles.length === 0 ? (
            <ListRow className="text-content-muted">등록된 회선이 없습니다</ListRow>
          ) : shown.length === 0 ? (
            <ListRow className="text-content-muted">검색 결과가 없습니다</ListRow>
          ) : shown.map((b) => {
            const k = roleKey(b.role);
            const sum = summary(view, model, b);
            return (
              <ListRow
                key={b.id}
                onClick={() => onBundle(b.id)}
                meta={[sum, `광선로 ${b.lineIds.length}`].filter(Boolean).join(' · ')}
                trailing={<span className={cn(k === 'none' ? 'text-content-muted' : 'font-medium text-primary')}>{ROLE_LABEL[k]}</span>}
                title={`${equipmentLabel(view, b.a)} ↔ ${equipmentLabel(view, b.b)}${sum ? ` — ${sum}` : ''}`}
                {...on(picked.bundles.has(b.id))}
              >
                {ends(view, b)}
              </ListRow>
            );
          })}
        </div>
      </DetailCard>
    </div>
  );
}
