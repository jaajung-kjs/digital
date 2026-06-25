import { useEffectiveCables } from '../../workingCopy/hooks';
import { useCableCategories } from '../hooks/useCableCategories';
import { useTraceGraph } from '../../trace/traceGraph';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { isOpgwTwin } from '../cableEndpoint';
import { routeDeleteIds } from '../../fiber/fiberWrite';
import { DetailCard, DetailCardHeader, DetailRow, DetailNote } from '../../../components/ui';
import { EditableField } from '../../assets/components/EditableField';
import { CableTypePicker } from './CableTypePicker';
import { normalizeCableColor } from '../../../types/connection';

/**
 * 케이블 일반 속성(종류·라벨·색·설명) 편집의 단일 SSOT UI — 외형은 공용 DetailCard
 * (다른 탭의 상세 카드와 픽셀 일관). 모든 필드는 현재값으로 프리필된다.
 *
 * 분리: 번호(코어/CB)는 도메인(선번장/계통)이 부여 → 읽기전용. specParams 도 그리드 전담(안내만).
 * 규격(specification)은 백엔드 파생(읽기전용)이라 미노출.
 */

/** 색상 피커 — 스와치(현재 실효색) 클릭 시 네이티브 컬러 선택. */
function ColorField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#6b7280';
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <span className="h-5 w-5 rounded border border-line" style={{ background: value || '#6b7280' }} />
      <span className="text-xs text-content-muted">{value || '—'}</span>
      <input type="color" value={hex} onChange={(e) => onCommit(e.target.value)} className="sr-only" aria-label="색상" />
    </label>
  );
}

export function CableInspector({ cableId, onDeleted }: { cableId: string; onDeleted?: () => void }) {
  const cables = useEffectiveCables();
  const { data: categories } = useCableCategories();
  const { graph } = useTraceGraph();

  const cable = cables.find((c) => c.id === cableId);
  if (!cable) return <DetailCard><DetailNote>케이블을 찾을 수 없습니다.</DetailNote></DetailCard>;

  const patch = (p: Record<string, unknown>) => useSubstationWorkingCopy.getState().stageCableUpdate(cableId, p);
  // OPGW(경로슬롯↔경로슬롯)는 케이블만 지우면 ghost 슬롯이 남아 삭제·동작 불가 → 경로(두 슬롯 +
  // 그 슬롯에 닿는 모든 FIBER 케이블) 통째 삭제. 일반 케이블은 그 케이블만.
  const del = () => {
    const wc = useSubstationWorkingCopy.getState();
    if (isOpgwTwin(cable as Parameters<typeof isOpgwTwin>[0])) {
      const { assetIds, cableIds } = routeDeleteIds(cable.sourceAssetId as string, cable.targetAssetId as string, cables as never);
      if (!window.confirm(`이 경로와 연결된 코어 케이블 ${Math.max(0, cableIds.length - 1)}개도 함께 삭제됩니다. 계속할까요?`)) return;
      for (const id of cableIds) wc.remove('cables', id);
      for (const id of assetIds) wc.remove('assets', id);
    } else {
      wc.stageCableDelete(cableId);
    }
    onDeleted?.();
  };

  const src = graph?.nameById.get(cable.sourceAssetId as string) ?? '';
  const tgt = graph?.nameById.get(cable.targetAssetId as string) ?? '';
  const categoryId = (cable.categoryId as string | null) ?? null;
  const commitCategory = (id: string | null) => {
    const c = (categories ?? []).find((x) => x.id === id) ?? null;
    patch({ categoryId: id, categoryName: c?.name ?? null, displayColor: c?.groupColor ?? null });
  };
  // 실효 색 = 종류 그룹색. 피커는 항상 현재 사용중인 색을 기본값으로.
  const effectiveColor = normalizeCableColor(cable.groupColor as string | null) || '';
  const hasSpec = cable.specParams != null && Object.keys(cable.specParams as object).length > 0;
  const isOpgw = (cable.specParams as { coreMeta?: unknown } | null)?.coreMeta != null;

  return (
    <DetailCard>
      <DetailCardHeader title={src && tgt ? `${src} – ${tgt}` : '케이블'} onDelete={del} />
      {/* 2열 그리드로 세로 길이 절감 — 짧은 필드는 반폭, 설명만 전폭. */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <DetailRow label="종류">
          <CableTypePicker value={categoryId} onChange={commitCategory} />
        </DetailRow>
        <DetailRow label="번호">
          <span className="text-sm text-content">{cable.number != null ? String(cable.number) : <span className="text-content-faint">—</span>}</span>
        </DetailRow>
        <DetailRow label="색상">
          <ColorField value={effectiveColor} onCommit={(v) => patch({ color: v })} />
        </DetailRow>
        <div className="col-span-2">
          <DetailRow label="설명">
            <EditableField value={(cable.description as string | null) ?? ''} ariaLabel="설명" placeholder="설명" valueClickEdits onCommit={(v) => patch({ description: v.trim() || null })} />
          </DetailRow>
        </div>
      </div>
      {hasSpec && <DetailNote>상세값은 {isOpgw ? '선번장' : '계통'} 그리드에서 편집합니다.</DetailNote>}
    </DetailCard>
  );
}
