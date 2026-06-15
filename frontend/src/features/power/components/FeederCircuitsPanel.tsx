import { useEffect, useMemo, useState } from 'react';
import { useEffectiveAssets } from '../../workingCopy/hooks';
import { useTraceGraph } from '../../trace/traceGraph';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { buildFeederCircuits } from '../feederCircuits';
import { commitMeta } from '../powerRegisterDescriptor';
import { BreakerRail } from '../../../components/BreakerRail';
import { EditableField } from '../../assets/components/EditableField';
import type { Asset } from '../../../types/asset';

/**
 * 피더(distributor) 상세 "분기" 섹션 — 차단기 DIN 레일 + 선택 차단기 상세 + 부하 하이라이트.
 * 분기 = 피더 아래 CB 회로(케이블). 전역 graph.cables 에서 파생(SSOT). 새 부하 연결은 비범위.
 */
export function FeederCircuitsPanel({ feederId }: { feederId: string }) {
  const assets = useEffectiveAssets() as Asset[];
  const { graph } = useTraceGraph();
  const [selectedCb, setSelectedCb] = useState<number | null>(null);

  const feeder = useMemo(() => assets.find((a) => a.id === feederId) ?? null, [assets, feederId]);
  const circuits = useMemo(
    () => (feeder && graph ? buildFeederCircuits({ id: feeder.id }, graph.cables as never[], graph.nameById) : []),
    [feeder, graph],
  );
  const selected = circuits.find((c) => c.cbNumber === selectedCb) ?? null;

  useEffect(() => {
    const hi = usePathHighlightStore.getState();
    if (selectedCb === null) return;
    if (selected?.cableId) hi.startTrace(selected.cableId);
    else hi.clearHighlight();
  }, [selectedCb, selected?.cableId]);
  useEffect(() => () => usePathHighlightStore.getState().clearHighlight(), []);

  const toggle = (cbNumber: number) => {
    const c = circuits.find((x) => x.cbNumber === cbNumber);
    if (!c?.cableId) return;
    commitMeta(c.cableId, 'switchState', c.switchState.toUpperCase() === 'ON' ? 'OFF' : 'ON');
  };

  if (!circuits.length) {
    return <p className="px-1 text-[11px] text-content-faint">분기 정보를 불러올 수 없습니다.</p>;
  }

  return (
    <div className="space-y-3">
      <BreakerRail circuits={circuits} selectedCb={selectedCb} onSelect={setSelectedCb} onToggle={toggle} />
      {selected && (
        <div className="rounded border border-line p-2 text-xs space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="font-medium">CB {selected.cbNumber}</span>
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-content-muted">
              {selected.occupied ? (selected.switchState || '—') : '미연결'}
            </span>
          </div>
          <div className="text-content-muted">부하: <span className="text-content">{selected.loadName ?? '—'}</span></div>
          {selected.occupied && selected.cableId && (
            <>
              <label className="flex items-center gap-2 text-content-muted">용량
                <EditableField value={selected.capacity} ariaLabel="용량" placeholder="용량"
                  onCommit={(v) => commitMeta(selected.cableId!, 'capacity', v || null)} />
              </label>
              <label className="flex items-center gap-2 text-content-muted">개폐
                <EditableField value={selected.switchState} type="select" ariaLabel="개폐"
                  options={[{ value: '', label: '—' }, { value: 'ON', label: 'ON' }, { value: 'OFF', label: 'OFF' }]}
                  onCommit={(v) => commitMeta(selected.cableId!, 'switchState', v || null)} />
              </label>
            </>
          )}
          <p className="text-[10px] text-content-faint">자세한 회로 정보는 계통뷰에서.</p>
        </div>
      )}
    </div>
  );
}
