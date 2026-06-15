import { useEffect, useMemo } from 'react';
import { useEffectiveAssets } from '../../workingCopy/hooks';
import { useTraceGraph } from '../../trace/traceGraph';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useEditorStore } from '../../editor/stores/editorStore';
import { useInteractionStore } from '../../editor/stores/interactionStore';
import { useWorkspaceNav } from '../../workspace/WorkspaceNavContext';
import { buildFeederCircuits, buildFeederInput, feederGridSlots } from '../feederCircuits';
import { commitMeta } from '../powerRegisterDescriptor';
import { useCablePick } from '../../editor/hooks/useCablePick';
import { floorAnchor, floorTargetFor } from '../../workingCopy/floorAnchor';
import { toMapById } from '../../../utils/byId';
import { BreakerRail } from '../../../components/BreakerRail';
import { DetailCard, DetailCardHeader, DetailRow, DetailNote } from '../../../components/ui';
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

  const pick = useCablePick();

  const feeder = useMemo(() => assets.find((a) => a.id === feederId) ?? null, [assets, feederId]);
  // 점유 회로(데이터) → 고정 그리드(빈 슬롯 패딩, 표시).
  const occupied = useMemo(
    () => (feeder && graph ? buildFeederCircuits({ id: feeder.id }, graph.cables as never[], graph.nameById) : []),
    [feeder, graph],
  );
  const slots = useMemo(() => feederGridSlots(occupied), [occupied]);
  const selected = occupied.find((c) => c.cbNumber === selectedCb) ?? null;
  // 피더 공급(IN) — role==='IN' 케이블 1개(없으면 null). 전역 graph.cables 에서 파생(SSOT).
  const input = useMemo(
    () => (feeder && graph ? buildFeederInput({ id: feeder.id }, graph.cables as never[], graph.nameById) : null),
    [feeder, graph],
  );

  // 케이블 피킹 모드: 피더의 placed floor anchor + 중심좌표를 1회 해소.
  // anchor = 피더가 도면에 보이는 대표 설비(보통 분전반), position = 그 사각형 중심.
  const anchorRect = useMemo(() => {
    if (!feeder) return null;
    const anchor = floorAnchor(feeder.id, toMapById(assets));
    if (!anchor) return null;
    const rect = floorTargetFor(feeder.id, assets);
    if (!rect) return null;
    return { anchorId: anchor.id, position: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } };
  }, [feeder, assets]);

  // CB 칸(점유/빈) 클릭 → 케이블 endpoint(피더 OUT, CB 번호) 로 onPick.
  // 빈 칸 = 다음 빈 CB 번호(슬롯의 cbNumber), 점유 칸 = 그 CB 번호.
  const pickCb = (cbNumber: number) => {
    if (!feeder || !anchorRect) return;
    pick.onPick({
      containerAssetId: anchorRect.anchorId,
      position: anchorRect.position,
      innerAssetId: feeder.id,
      role: 'OUT',
      number: cbNumber,
    });
  };

  useEffect(() => {
    const hi = usePathHighlightStore.getState();
    if (selectedCb === null) return;
    if (selected?.cableId) hi.startTrace(selected.cableId);
    else hi.clearHighlight();
  }, [selectedCb, selected?.cableId]);
  useEffect(() => () => usePathHighlightStore.getState().clearHighlight(), []);

  const toggle = (cbNumber: number) => {
    const c = occupied.find((x) => x.cbNumber === cbNumber);
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

  // 입력(IN) 연결 = 평면도로 이동 + 이 피더의 IN 을 출발점으로 케이블 그리기 진입(addCb 의 IN 판). Phase 4 에서 startCableConnection 으로 교체.
  const connectInput = () => {
    if (!feeder || !anchorRect) return;
    useEditorStore.getState().setTool('cable');
    useInteractionStore.getState().cableActivate({
      source: { containerAssetId: anchorRect.anchorId, position: anchorRect.position, innerAssetId: feeder.id, role: 'IN' },
    });
    nav?.gotoAsset(feeder.id);
  };
  // 입력(IN) 삭제 = 그 공급 케이블 제거(피더에서 즉시 빠진다).
  const deleteInput = () => {
    if (!input) return;
    if (!confirm('입력(공급) 케이블을 삭제할까요? 연결이 제거됩니다.')) return;
    useSubstationWorkingCopy.getState().stageCableDelete(input.cableId);
  };
  // 피킹 모드: IN 슬롯 클릭 → 이 피더의 IN endpoint(번호 없음) 로 onPick.
  const pickIn = () => {
    if (!feeder || !anchorRect) return;
    pick.onPick({
      containerAssetId: anchorRect.anchorId,
      position: anchorRect.position,
      innerAssetId: feeder.id,
      role: 'IN',
    });
  };

  if (!feeder) {
    return <p className="px-1 text-xs text-content-faint">분기 정보를 불러올 수 없습니다.</p>;
  }

  return (
    <div className="space-y-3">
      {/* 입력(IN) 슬롯 — 분기 그리드 위. 점유=공급원 표시(+삭제), 빈=입력 연결. 피킹 모드면 전체가 IN endpoint pick. */}
      {input ? (
        pick.active ? (
          <button
            type="button"
            onClick={pickIn}
            aria-label="입력 선택"
            className="flex w-full items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2 shadow-sm transition-colors hover:border-primary hover:bg-info-bg"
          >
            <span className="text-xs font-medium text-content-muted">입력</span>
            <span className="text-sm text-content">{input.sourceName ?? '—'}</span>
          </button>
        ) : (
          <div className="group flex w-full items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2 shadow-sm">
            <span className="text-xs font-medium text-content-muted">입력</span>
            <span className="flex items-center gap-2">
              <span className="text-sm text-content">{input.sourceName ?? '—'}</span>
              <button
                type="button"
                aria-label="입력 삭제"
                onClick={deleteInput}
                className="flex h-4 w-4 items-center justify-center rounded-full border border-line bg-surface text-[10px] leading-none text-danger opacity-0 shadow-sm transition-opacity hover:bg-danger-bg group-hover:opacity-100"
              >
                ×
              </button>
            </span>
          </div>
        )
      ) : (
        <button
          type="button"
          onClick={pick.active ? pickIn : connectInput}
          aria-label={pick.active ? '입력 선택' : '입력 연결'}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-line bg-surface/40 px-3 py-2 text-content-faint transition-colors hover:border-primary hover:bg-info-bg hover:text-primary"
        >
          <span className="text-base leading-none" aria-hidden="true">＋</span>
          <span className="text-xs font-medium">입력 연결</span>
        </button>
      )}
      <BreakerRail
        circuits={slots}
        selectedCb={selectedCb}
        // 피킹 모드: 점유 칸 클릭 = 그 CB endpoint, 빈 칸(＋) = 다음 빈 CB endpoint.
        // 일반 모드: 점유 = 선택, 빈 칸 = CB 추가(평면도 케이블 그리기).
        onSelect={pick.active ? pickCb : setSelectedCb}
        onToggle={toggle}
        onAddCb={pick.active
          ? () => { const empty = slots.find((s) => !s.occupied); if (empty) pickCb(empty.cbNumber); }
          : addCb}
        onDeleteCb={deleteCb}
      />
      {selected && (
        <DetailCard>
          <DetailCardHeader
            title={`CB ${selected.cbNumber}`}
            badge={selected.occupied ? (selected.switchState || '—') : '미연결'}
            badgeStatus={selected.occupied && selected.switchState.toUpperCase() === 'ON' ? 'success' : 'neutral'}
            onDelete={selected.occupied && selected.cableId ? () => deleteCb(selected.cbNumber, selected.cableId!) : undefined}
          />
          <DetailRow label="부하">{selected.loadName ?? '—'}</DetailRow>
          {selected.occupied && selected.cableId && (
            <>
              <DetailRow label="용량">
                <EditableField value={selected.capacity} ariaLabel="용량" placeholder="용량"
                  onCommit={(v) => commitMeta(selected.cableId!, 'capacity', v || null)} />
              </DetailRow>
              <DetailRow label="개폐">
                <EditableField value={selected.switchState} type="select" ariaLabel="개폐"
                  options={[{ value: '', label: '—' }, { value: 'ON', label: 'ON' }, { value: 'OFF', label: 'OFF' }]}
                  onCommit={(v) => commitMeta(selected.cableId!, 'switchState', v || null)} />
              </DetailRow>
            </>
          )}
          <DetailNote>자세한 회로 정보는 계통뷰에서.</DetailNote>
        </DetailCard>
      )}
    </div>
  );
}
