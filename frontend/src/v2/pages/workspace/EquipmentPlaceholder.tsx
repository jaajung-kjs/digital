import { DetailCard, DetailRow, EmptyState, ViewCard } from '../../../components/ui';
import type { StatusRow } from '../../components/status/statusRows';

/**
 * 오른쪽 상세 자리 — **늘 서 있다**(CONVENTIONS §1.7-e). 고른 설비가 없어도 같은 폭의 카드가 남는다.
 * 상세 편집은 다음 단계가 이 자리를 채운다 — 지금은 이름·품목·랙만 보인다.
 */
export function EquipmentPlaceholder({ row, plan = false }: { row: StatusRow | null; /** 평면도 — 거기서 고르는 것은 랙이다. */ plan?: boolean }) {
  if (!row) {
    return (
      /* 빈 상태도 머리 띠를 둔다 — 고르면 띠가 생겨 판이 뛰던 것을 막는다(제목 자리만 잡는다). */
      <ViewCard title="상세">
        {plan
          ? <EmptyState title="선택된 랙이 없습니다" description="도면에서 랙을 선택하세요." />
          : <EmptyState title="선택된 설비가 없습니다" description="표에서 설비나 랙을 선택하세요." />}
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
