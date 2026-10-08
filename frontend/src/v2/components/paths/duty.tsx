import { coreRoleCircuitLabel, isBackupRole, isMainRole, type CoreRole } from '@twin/core';
import { Badge } from '../../../components/ui';

/**
 * 회선의 주/예비(경로의 `duty` — 코어 주/예비 값에서 파생)를 **어디서나 같은 모양으로** — 회선 목록 꼬리·중계경로 창 배지·
 * 광 계통도 겹침 선·범례가 이 파일만 읽는다. 판정은 core 의 `isMainRole`·`isBackupRole`, 말은 `coreRoleCircuitLabel`.
 */
type Duty = CoreRole | null;

/** 겹침 선의 모양 — 주회선 실선 · 예비회선 점선 · 주/예비 미지정 옅은 강조색(굵게). 지도와 범례가 같은 값을 쓴다. */
export interface DutyStroke { className: string; width: number; dash: string | undefined; cap: 'round' | 'butt' }
export function dutyStroke(d: Duty): DutyStroke {
  if (isMainRole(d)) return { className: 'stroke-primary', width: 3, dash: undefined, cap: 'round' };
  if (isBackupRole(d)) return { className: 'stroke-primary', width: 3, dash: '8 5', cap: 'butt' };
  return { className: 'stroke-primary/60', width: 4, dash: undefined, cap: 'round' };
}

/** 범례·목록 정렬 차례 — 주회선, 예비회선, 미지정. */
export const dutyOrder = (d: Duty) => (isMainRole(d) ? 0 : isBackupRole(d) ? 1 : 2);

/** 데이터 속성 값(시험·스타일 고리) — `main` · `backup` · `none`. */
export const dutyAttr = (d: Duty): string => d ?? 'none';

/**
 * 주/예비 배지 — 주회선·예비회선은 강조색(예비회선은 점선 테 — 지도의 점선과 같은 뜻), 미지정은 흐린 배지.
 */
export function DutyBadge({ duty }: { duty: Duty }) {
  const label = coreRoleCircuitLabel(duty);
  if (isMainRole(duty)) return <Badge status="info" data-duty="main">{label}</Badge>;
  if (isBackupRole(duty)) return <Badge status="info" data-duty="backup" className="border border-dashed border-info">{label}</Badge>;
  return <Badge status="neutral" data-duty="none">{label}</Badge>;
}

/** 범례 한 칸 — 지도의 겹침 선과 같은 굵기·점선. */
export function DutyLegend({ duty }: { duty: Duty }) {
  const s = dutyStroke(duty);
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <svg width="24" height="8" aria-hidden>
        <line x1="2" y1="4" x2="22" y2="4" strokeWidth={s.width} strokeDasharray={s.dash} strokeLinecap={s.cap} className={s.className} />
      </svg>
      {coreRoleCircuitLabel(duty)}
    </span>
  );
}
