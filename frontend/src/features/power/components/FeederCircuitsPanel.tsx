import { useEffect, useMemo } from 'react';
import { useEffectiveAssets } from '../../workingCopy/hooks';
import { useTraceGraph } from '../../trace/traceGraph';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useEditorStore } from '../../editor/stores/editorStore';
import { useWorkspaceNav } from '../../workspace/WorkspaceNavContext';
import { buildFeederCircuits } from '../feederCircuits';
import { commitMeta } from '../powerRegisterDescriptor';
import { BreakerRail } from '../../../components/BreakerRail';
import { EditableField } from '../../assets/components/EditableField';
import { useSelectionStore } from '../../workspace/selectionStore';
import type { Asset } from '../../../types/asset';

/**
 * 피더(distributor) 상세 "분기" 섹션 — 차단기 DIN 레일 + 선택 차단기 상세 + 부하 하이라이트.
 * 분기 = 피더 아래 CB 회로(케이블). 전역 graph.cables 에서 파생(SSOT). 새 부하 연결은 비범위.
 */
export function FeederCircuitsPanel({ feederId }: { feederId: string }) {
  const assets = useEffectiveAssets() as Asset[];
  const { graph } = useTraceGraph();
  const nav = useWorkspaceNav();
  const selectedCb = useSelectionStore((s) => s.selectedCore);
  const setSelectedCb = (n: number | null) => useSelectionStore.getState().setSelectedCore(n);

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

  // CB 추가 = 평면도로 이동 + 케이블 그리기 진입(피더→부하 CB 를 직접 그린다). 빈 차단기 = 이 버튼.
  const addCb = () => {
    if (!feeder) return;
    useEditorStore.getState().setTool('cable');
    nav?.gotoAsset(feeder.id);
  };
  // CB 삭제 = 그 분기 케이블 제거(피더에서 즉시 빠진다). 선택 중이던 CB면 선택 해제.
  const deleteCb = (cbNumber: number, cableId: string) => {
    if (!confirm(`CB ${cbNumber} 분기를 삭제할까요? 연결된 케이블이 제거됩니다.`)) return;
    useSubstationWorkingCopy.getState().stageCableDelete(cableId);
    if (selectedCb === cbNumber) setSelectedCb(null);
  };

  if (!circuits.length) {
    return <p className="px-1 text-[11px] text-content-faint">분기 정보를 불러올 수 없습니다.</p>;
  }

  return (
    <div className="space-y-3">
      <BreakerRail
        circuits={circuits}
        selectedCb={selectedCb}
        onSelect={setSelectedCb}
        onToggle={toggle}
        onAddCb={addCb}
        onDeleteCb={deleteCb}
      />
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
              <div className="flex items-center gap-2 text-content-muted">
                <span className="w-10 shrink-0 whitespace-nowrap">용량</span>
                <span className="min-w-0 flex-1">
                  <EditableField value={selected.capacity} ariaLabel="용량" placeholder="용량"
                    onCommit={(v) => commitMeta(selected.cableId!, 'capacity', v || null)} />
                </span>
              </div>
              <div className="flex items-center gap-2 text-content-muted">
                <span className="w-10 shrink-0 whitespace-nowrap">개폐</span>
                <span className="min-w-0 flex-1">
                  <EditableField value={selected.switchState} type="select" ariaLabel="개폐"
                    options={[{ value: '', label: '—' }, { value: 'ON', label: 'ON' }, { value: 'OFF', label: 'OFF' }]}
                    onCommit={(v) => commitMeta(selected.cableId!, 'switchState', v || null)} />
                </span>
              </div>
            </>
          )}
          <p className="text-[10px] text-content-faint">자세한 회로 정보는 계통뷰에서.</p>
        </div>
      )}
    </div>
  );
}
