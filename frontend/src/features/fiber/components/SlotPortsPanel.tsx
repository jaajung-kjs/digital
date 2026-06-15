import { useEffect, useMemo } from 'react';
import { useEffectiveAssets } from '../../workingCopy/hooks';
import { useTraceGraph } from '../../trace/traceGraph';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { useSelectionStore } from '../../workspace/selectionStore';
import { buildSlotPorts, type PortState } from '../slotPorts';
import type { CableLike } from '../slotRegister';
import { PortGrid } from '../../../components/PortGrid';
import { DetailCard, DetailCardHeader, DetailRow, DetailNote } from '../../../components/ui';
import type { Asset } from '../../../types/asset';

const STATE_LABEL: Record<PortState, string> = { empty: '미연결', half: '편도', full: '양측' };

/**
 * 광슬롯(conduit) 상세 "포트" 섹션 — 정사각 포트 매트릭스(PortGrid) + 선택 포트 상세 + 하이라이트.
 * 데이터는 파생(buildSlotPorts). 빈 포트 연결(피커)은 P3 범위.
 */
export function SlotPortsPanel({ slotId }: { slotId: string }) {
  const assets = useEffectiveAssets() as Asset[];
  const { graph } = useTraceGraph();
  // 포트 상태도 전역 케이블에서 파생 — 선번장과 동일 SSOT, 대국 OUT 포함.
  const cables = (graph?.cables ?? []) as unknown as CableLike[];
  const selectedCore = useSelectionStore((s) => s.selectedCore);

  const slot = useMemo(() => assets.find((a) => a.id === slotId) ?? null, [assets, slotId]);
  const ports = useMemo(
    () => (slot ? buildSlotPorts({ id: slot.id }, cables, graph) : []),
    [slot, cables, graph],
  );

  const selected = ports.find((p) => p.coreNumber === selectedCore) ?? null;
  const traceCableId = selected ? (selected.localCableId ?? selected.remoteCableId) : null;

  // 선택 포트 → 코어 트레이스 하이라이트. selectedCore/traceCableId(원시값)에만 의존 →
  // cables/graph 폴링으로 ports 가 새 참조가 돼도 선택이 그대로면 재트레이스 안 함.
  useEffect(() => {
    const hi = usePathHighlightStore.getState();
    if (selectedCore === null) return;          // 미선택이면 하이라이트 건드리지 않음
    if (traceCableId) hi.startTrace(traceCableId);
    else hi.clearHighlight();
  }, [selectedCore, traceCableId]);

  // 패널 unmount 시 잔상 제거.
  useEffect(() => () => usePathHighlightStore.getState().clearHighlight(), []);

  const nameOf = (id: string | null) => (id ? (graph?.nameById.get(id) ?? id) : null);
  const subOf = (id: string | null) => (id ? (graph?.subNameById.get(id) ?? null) : null);
  const label = (id: string | null) => {
    const n = nameOf(id);
    if (!n) return '—';
    const s = subOf(id);
    return s ? `${n} (${s})` : n;
  };

  if (ports.length === 0) {
    return <p className="px-1 text-xs text-content-faint">광경로(용량) 설정이 없어 포트를 표시할 수 없습니다.</p>;
  }

  return (
    <div className="space-y-3">
      <PortGrid ports={ports} selectedCore={selectedCore} onSelect={(n) => useSelectionStore.getState().setSelectedCore(n)} />
      {selected && (
        <DetailCard>
          <DetailCardHeader
            title={`포트 ${selected.coreNumber}`}
            badge={STATE_LABEL[selected.state]}
            badgeStatus={selected.state === 'full' ? 'success' : selected.state === 'half' ? 'info' : 'neutral'}
          />
          <DetailRow label="자국">{label(selected.localAssetId)}</DetailRow>
          <DetailRow label="대국">{label(selected.remoteAssetId)}</DetailRow>
          <DetailNote>자세한 코어 정보는 선번장에서 확인하세요.</DetailNote>
        </DetailCard>
      )}
    </div>
  );
}
