import { useEffect, useMemo, useState } from 'react';
import { useEffectiveAssets } from '../../workingCopy/hooks';
import { useTraceGraph } from '../../trace/traceGraph';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { startCableConnection } from '../../editor/cableConnection';
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
  // 입력(IN) 상세 카드 표시 — CB 선택과 상호배타(하나만 뜬다).
  const [showInput, setShowInput] = useState(false);

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
    // 1대다 자산: 점유된 분기엔 연결 불가 — 빈 CB 에만 연결한다.
    if (slots.find((s) => s.cbNumber === cbNumber)?.occupied) return;
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
    // 입력 상세를 보면 입력 케이블을 하이라이트(CB 선택과 동형). 둘 다 없으면 nothing.
    if (showInput && input?.cableId) { hi.startTrace(input.cableId); return; }
    if (selectedCb === null) return;
    if (selected?.cableId) hi.startTrace(selected.cableId);
    else hi.clearHighlight();
  }, [selectedCb, selected?.cableId, showInput, input?.cableId]);
  useEffect(() => () => usePathHighlightStore.getState().clearHighlight(), []);

  // CB 선택 = 입력 카드는 닫는다(한 번에 하나만).
  const selectCb = (cbNumber: number | null) => { setShowInput(false); setSelectedCb(cbNumber); };
  // 입력 타일 클릭(일반 모드) = 입력 카드 열기 + CB 선택 해제.
  const openInput = () => { setSelectedCb(null); setShowInput(true); };

  const toggle = (cbNumber: number) => {
    const c = occupied.find((x) => x.cbNumber === cbNumber);
    if (!c?.cableId) return;
    commitMeta(c.cableId, 'switchState', c.switchState.toUpperCase() === 'ON' ? 'OFF' : 'ON');
  };

  // CB 추가 = 평면도로 이동 + 케이블 그리기 진입(피더 OUT 출발 자동주입 → 부하 CB 도착만 그린다).
  // 클릭한 빈 차단기 번호를 출발 CB 번호로 주입한다(그 자리에 들어간다).
  const addCb = (cbNumber: number) => {
    if (!feeder || !anchorRect) return;
    startCableConnection({
      source: { containerAssetId: anchorRect.anchorId, position: anchorRect.position, innerAssetId: feeder.id, role: 'OUT', number: cbNumber },
    });
    nav?.gotoAsset(feeder.id);
  };
  // CB 삭제 = 그 분기 케이블 제거(피더에서 즉시 빠진다). 선택 중이던 CB면 선택 해제.
  const deleteCb = (cbNumber: number, cableId: string) => {
    if (!confirm(`CB ${cbNumber} 분기를 삭제할까요? 연결된 케이블이 제거됩니다.`)) return;
    useSubstationWorkingCopy.getState().stageCableDelete(cableId);
    if (selectedCb === cbNumber) setSelectedCb(null);
  };

  // 입력(IN) 연결 = 평면도로 이동 + 이 피더의 IN 을 출발점으로 케이블 그리기 진입(addCb 의 IN 판).
  const connectInput = () => {
    if (!feeder || !anchorRect) return;
    startCableConnection({
      source: { containerAssetId: anchorRect.anchorId, position: anchorRect.position, innerAssetId: feeder.id, role: 'IN' },
    });
    nav?.gotoAsset(feeder.id);
  };
  // 입력(IN) 삭제 = 그 공급 케이블 제거(피더에서 즉시 빠진다).
  const deleteInput = () => {
    if (!input) return;
    if (!confirm('입력(공급) 케이블을 삭제할까요? 연결이 제거됩니다.')) return;
    useSubstationWorkingCopy.getState().stageCableDelete(input.cableId);
    setShowInput(false);
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
      {/* 입력(IN) 모듈 — 분기 그리드 위 가로 전폭. 흰 바디 + 좌측 빨강 악센트(입력 식별, 분기 초록과 구분).
          일반=클릭 시 상세카드(공급원/용량/개폐), 피킹 모드=전체가 IN endpoint pick. 빈=빨강 점선 "입력 연결". */}
      {input ? (
        pick.active ? (
          <button
            type="button"
            onClick={pickIn}
            aria-label="입력 선택"
            className="relative flex w-full items-center gap-2 overflow-hidden rounded-md border border-line bg-surface py-2 pl-3 pr-3 shadow-sm transition-colors hover:border-primary hover:bg-info-bg"
          >
            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-danger" />
            <span className="text-xs font-medium text-danger">입력</span>
            <span className="min-w-0 flex-1 truncate text-left text-sm text-content">{input.sourceName ?? '—'}</span>
            {input.capacity && (
              <span className="rounded bg-danger-bg px-1.5 py-0.5 text-xs font-medium text-danger">{input.capacity}</span>
            )}
          </button>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={openInput}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openInput(); } }}
            aria-label="입력"
            aria-current={showInput ? 'true' : undefined}
            className={`group relative flex w-full cursor-pointer items-center gap-2 overflow-hidden rounded-md border bg-surface py-2 pl-3 pr-3 shadow-sm transition-[box-shadow,border-color] duration-150 hover:shadow-md ${
              showInput ? 'border-primary ring-2 ring-primary/30' : 'border-line hover:border-content-faint'
            }`}
          >
            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-danger" />
            <span className="text-xs font-medium text-danger">입력</span>
            <span className="min-w-0 flex-1 truncate text-sm text-content">{input.sourceName ?? '—'}</span>
            {input.capacity && (
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                input.switchState.toUpperCase() === 'ON' ? 'text-success bg-success-bg' : 'text-content-muted bg-surface-2'
              }`}>{input.capacity}</span>
            )}
            {/* 가로 개폐 스위치 — 차단기 토글의 가로판. 노브가 ON=오른쪽 / OFF=왼쪽으로 이동. */}
            {(() => {
              const isOn = input.switchState.toUpperCase() === 'ON';
              return (
                <button
                  type="button"
                  aria-label="입력 개폐"
                  onClick={(e) => { e.stopPropagation(); commitMeta(input.cableId, 'switchState', isOn ? 'OFF' : 'ON'); }}
                  title={isOn ? 'ON — 클릭해 차단' : 'OFF — 클릭해 투입'}
                  className={`relative h-5 w-8 shrink-0 rounded-full border shadow-inner transition-colors ${
                    isOn ? 'border-success/50 bg-success-bg' : 'border-line bg-surface-2'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border shadow-sm transition-all duration-200 ${
                      isOn ? 'right-[3px] border-success bg-success' : 'left-[3px] border-line bg-surface'
                    }`}
                  />
                </button>
              );
            })()}
            <button
              type="button"
              aria-label="입력 삭제"
              onClick={(e) => { e.stopPropagation(); deleteInput(); }}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-[10px] leading-none text-danger opacity-0 shadow-sm transition-opacity hover:bg-danger-bg group-hover:opacity-100"
            >
              ×
            </button>
          </div>
        )
      ) : (
        <button
          type="button"
          onClick={pick.active ? pickIn : connectInput}
          aria-label={pick.active ? '입력 선택' : '입력 연결'}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-danger/40 bg-danger-bg/30 px-3 py-2 text-danger/70 transition-colors hover:border-danger hover:bg-danger-bg hover:text-danger"
        >
          <span className="text-base leading-none" aria-hidden="true">＋</span>
          <span className="text-xs font-medium">입력 연결</span>
        </button>
      )}
      <BreakerRail
        circuits={slots}
        selectedCb={selectedCb}
        // 피킹 모드: 점유 칸 클릭 = pickCb(점유면 가드로 무시) → 사실상 빈 칸만 연결됨.
        //           빈 칸(＋) = 그 빈 CB 로 연결.
        // 일반 모드: 점유 = 선택, 빈 칸(＋) = 그 자리에 CB 추가(평면도 케이블 그리기).
        onSelect={pick.active ? pickCb : selectCb}
        onToggle={toggle}
        onAddCb={pick.active ? pickCb : addCb}
        onDeleteCb={deleteCb}
      />
      {showInput && input && (
        <DetailCard>
          <DetailCardHeader
            title="입력"
            badge={input.switchState || '—'}
            badgeStatus={input.switchState.toUpperCase() === 'ON' ? 'success' : 'neutral'}
            onDelete={deleteInput}
          />
          <DetailRow label="공급원">{input.sourceName ?? '—'}</DetailRow>
          <DetailRow label="용량">
            <EditableField value={input.capacity} ariaLabel="용량" placeholder="용량"
              onCommit={(v) => commitMeta(input.cableId, 'capacity', v || null)} />
          </DetailRow>
          <DetailRow label="개폐">
            <EditableField value={input.switchState} type="select" ariaLabel="개폐"
              options={[{ value: '', label: '—' }, { value: 'ON', label: 'ON' }, { value: 'OFF', label: 'OFF' }]}
              onCommit={(v) => commitMeta(input.cableId, 'switchState', v || null)} />
          </DetailRow>
          <DetailNote>입력(공급) 케이블 속성. 자세한 계통은 계통뷰에서.</DetailNote>
        </DetailCard>
      )}
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
