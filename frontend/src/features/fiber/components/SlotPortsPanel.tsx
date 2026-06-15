import { useEffect, useMemo, useState } from 'react';
import { useEffectiveAssets, useEffectiveCables } from '../../workingCopy/hooks';
import { useTraceGraph } from '../../trace/traceGraph';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { buildSlotPorts, type PortState } from '../slotPorts';
import type { CableLike } from '../slotRegister';
import { PortGrid } from '../../../components/PortGrid';
import type { Asset } from '../../../types/asset';

const STATE_LABEL: Record<PortState, string> = { empty: '미연결', half: '편도', full: '양측' };

/**
 * 광슬롯(conduit) 상세 "포트" 섹션 — 정사각 포트 매트릭스(PortGrid) + 선택 포트 상세 + 하이라이트.
 * 데이터는 파생(buildSlotPorts). 빈 포트 연결(피커)은 P3 범위.
 */
export function SlotPortsPanel({ slotId }: { slotId: string }) {
  const assets = useEffectiveAssets() as Asset[];
  // buildSlotPorts 는 CableLike(부분 형태)만 보면 됨 — 훅의 넓은 반환을 CableLike[] 로 좁혀 통과.
  const cables = useEffectiveCables() as unknown as CableLike[];
  const { graph } = useTraceGraph();
  const [selectedCore, setSelectedCore] = useState<number | null>(null);

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
    return <p className="px-1 text-[11px] text-content-faint">광경로(용량) 설정이 없어 포트를 표시할 수 없습니다.</p>;
  }

  return (
    <div className="space-y-3">
      <PortGrid ports={ports} selectedCore={selectedCore} onSelect={setSelectedCore} />
      {selected && (
        <div className="rounded border border-line p-2 text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">포트 {selected.coreNumber}</span>
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-content-muted">
              {STATE_LABEL[selected.state]}
            </span>
          </div>
          <div className="text-content-muted">자국: <span className="text-content">{label(selected.localAssetId)}</span></div>
          <div className="text-content-muted">대국: <span className="text-content">{label(selected.remoteAssetId)}</span></div>
          <p className="text-[10px] text-content-faint">자세한 코어 정보는 선번장에서 확인하세요.</p>
        </div>
      )}
    </div>
  );
}
