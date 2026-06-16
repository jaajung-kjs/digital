import { useMemo } from 'react';
import { useEffectiveAssets } from '../../workingCopy/hooks';
import { useTraceGraph } from '../../trace/traceGraph';
import { useSelectionStore } from '../../workspace/selectionStore';
import { buildSlotPorts, type PortState } from '../slotPorts';
import type { CableLike } from '../slotRegister';
import { useCablePick } from '../../editor/hooks/useCablePick';
import { floorAnchor, floorTargetFor } from '../../workingCopy/floorAnchor';
import { toMapById } from '../../../utils/byId';
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

  const pick = useCablePick();

  const slot = useMemo(() => assets.find((a) => a.id === slotId) ?? null, [assets, slotId]);
  const ports = useMemo(
    () => (slot ? buildSlotPorts({ id: slot.id }, cables, graph) : []),
    [slot, cables, graph],
  );

  // 케이블 피킹 모드: 슬롯(conduit)의 placed floor anchor(보통 OFD) + 중심좌표 1회 해소.
  const anchorRect = useMemo(() => {
    if (!slot) return null;
    const anchor = floorAnchor(slot.id, toMapById(assets));
    if (!anchor) return null;
    const rect = floorTargetFor(slot.id, assets);
    if (!rect) return null;
    return { anchorId: anchor.id, position: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } };
  }, [slot, assets]);

  // 포트 클릭 → 케이블 endpoint(슬롯 OUT, 코어 번호) 로 onPick.
  // 1대다 자산: 자국 측이 이미 점유된 포트엔 연결 불가 — 빈 포트(자국 free)에만 연결한다.
  const pickPort = (coreNumber: number) => {
    if (!slot || !anchorRect) return;
    if (ports.find((p) => p.coreNumber === coreNumber)?.localCableId) return;
    pick.onPick({
      containerAssetId: anchorRect.anchorId,
      position: anchorRect.position,
      slotId: slot.id,
      coreNumber,
      role: 'OUT',
    });
  };

  const selected = ports.find((p) => p.coreNumber === selectedCore) ?? null;

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
      <PortGrid
        ports={ports}
        selectedCore={selectedCore}
        // 피킹 모드: 포트 클릭 = endpoint onPick(자국 점유 포트는 흐리게 + 픽 불가). 일반 모드: 포트 선택.
        onSelect={pick.active ? pickPort : (n) => useSelectionStore.getState().setSelectedCore(n)}
        dimOccupied={pick.active}
      />
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
