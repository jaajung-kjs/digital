import { useMemo } from 'react';
import { Button, DetailCard, DetailCardHeader, ErrorStrip, formatDateTime } from '../../../components/ui';
import { apiErrorMessage } from '../../apiError';
import { useEquipmentChanges } from '../../model/hooks';
import { equipmentPending } from '../../model/store/pendingFor';
import { useWorkingCopy } from '../../model/store/workingCopy';
import { historyLines } from './historyLines';

/**
 * 설비 변경 이력 — 저장(커밋)마다 남은 기록 중 이 설비에 닿은 것, 최신부터.
 * 항목 하나 = 저장 한 번(「일시 · 사용자」), 그 아래 바뀐 칸마다 한 줄. 저장 전 변경은 서버에 없으므로 싣지 않고, 있으면 한 줄로 알린다.
 */
export function HistoryTab({ equipmentId }: { equipmentId: string }) {
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const { pending, isNew } = useMemo(() => equipmentPending({ saved, overlays }, equipmentId), [saved, overlays, equipmentId]);
  const q = useEquipmentChanges(equipmentId, !isNew);
  const entries = q.data?.pages.flatMap((p) => p.entries) ?? [];

  return (
    <DetailCard>
      <DetailCardHeader title="변경 이력" />
      {pending && <p className="text-xs text-content-muted">저장 전 변경은 이력에 없습니다</p>}
      {q.isError && <ErrorStrip message={apiErrorMessage(q.error, '변경 이력을 불러오지 못했습니다')} />}
      {!isNew && q.isPending && <p className="text-xs text-content-faint">불러오는 중</p>}
      {(isNew || q.isSuccess) && entries.length === 0 && !q.hasNextPage && (
        <p className="text-xs text-content-faint">변경 이력이 없습니다</p>
      )}
      {entries.map((e) => (
        <DetailCard key={e.id}>
          <DetailCardHeader title={`${formatDateTime(e.at)} · ${e.username}`} />
          <ul className="space-y-0.5 text-sm text-content">
            {e.items.flatMap((it, i) => historyLines(it).map((line, j) => <li key={`${i}-${j}`} className="break-words">{line}</li>))}
          </ul>
        </DetailCard>
      ))}
      {q.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
            {q.isFetchingNextPage ? '불러오는 중' : '더 보기'}
          </Button>
        </div>
      )}
    </DetailCard>
  );
}
