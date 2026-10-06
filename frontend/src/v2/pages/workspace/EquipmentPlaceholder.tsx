import { DetailCard, DetailRow, EmptyState, ViewCard } from '../../../components/ui';
import type { StatusRow } from '../../components/status/statusRows';

/**
 * 오른쪽 상세 자리 — **늘 서 있다**(CONVENTIONS §1.7-e). 고른 설비가 없어도 같은 폭의 카드가 남는다.
 * 상세 편집은 다음 단계가 이 자리를 채운다 — 지금은 이름·품목·랙만 보인다.
 */
export function EquipmentPlaceholder({ row }: { row: StatusRow | null }) {
  if (!row) {
    return (
      <ViewCard>
        <EmptyState title="고른 설비가 없습니다" description="표나 도면에서 하나를 누르세요." />
      </ViewCard>
    );
  }
  return (
    <ViewCard title={row.name}>
      <DetailCard>
        <DetailRow label="품목">{row.typeName}</DetailRow>
        <DetailRow label="랙">{row.rackName}</DetailRow>
      </DetailCard>
    </ViewCard>
  );
}
