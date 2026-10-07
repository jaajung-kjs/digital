import type { PathBundle } from '@twin/core';
import { Button, cn, DetailCard, DetailCardHeader, ListRow, SELECTED } from '../../../components/ui';
import type { NetworkView } from './networkSelectors';
import { equipmentLabel, type OpticalMapModel, type Ring, type Warning } from './opticalMapModel';
import { pathSummary } from './pathChain';

/** 코어의 주/예비 값 → 화면 말. 사용자 권한 role 이 아니다. */
export const ROLE_LABEL = { main: '주회선', backup: '예비회선', none: '구분 없음' } as const;
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
  /** 회선 목록 검색어 — 머리 띠 오른쪽 끝의 검색 상자가 쥔다. */
  query: string;
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
export function PathPanel({ view, model, query, picked, onBundle, onRing, onWarning, onClear }: PathPanelProps) {
  const byId = new Map(model.bundles.map((b) => [b.id, b]));
  const lineName = (id: string) => model.lines.find((l) => l.id === id)?.name ?? view.line(id)?.name ?? '—';
  const shown = filterBundles(view, model, query);
  const any = picked.bundles.size + picked.rings.size + picked.warnings.size > 0;
  const on = (yes: boolean) => (yes ? { 'aria-current': true as const, className: SELECTED } : {});

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto" data-testid="path-panel">
      <DetailCard>
        <DetailCardHeader title="이중화 경고" badge={model.warnings.length} badgeStatus={model.warnings.length > 0 ? 'warning' : 'neutral'} />
        <div data-testid="warning-list">
          {model.warnings.length === 0 ? (
            <ListRow className="text-content-muted">주·예비회선이 같은 광선로를 지나는 회선이 없습니다</ListRow>
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

      <DetailCard>
        <DetailCardHeader title="링" badge={model.rings.length} />
        <div data-testid="ring-list">
          {model.rings.length === 0 ? (
            <ListRow className="text-content-muted">링이 없습니다</ListRow>
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

      <DetailCard>
        <DetailCardHeader
          title="회선"
          badge={model.bundles.length}
          actions={any ? <Button variant="secondary" size="sm" onClick={onClear}>선택 해제</Button> : undefined}
        />
        <div data-testid="bundle-list">
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
                trailing={<span className={cn(k === 'none' ? 'text-content-faint' : 'font-medium text-primary')}>{ROLE_LABEL[k]}</span>}
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
