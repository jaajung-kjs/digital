/**
 * PowerRegisterView — 계통 뷰
 *
 * 상단: 컨테이너(전원 포트를 가진 자산) Select
 * 테이블 컬럼: 피더 | 차단기 번호 | 상태 | 전원 입력(peer + 전압) | 부하 출력(peer)
 *   - 차단기 번호: 인라인 Input (blur/Enter 무변경 가드) → stageAssetUpdate fieldValues 병합
 *   - 상태: catalog fieldDefs switchState Select(옵션 데이터 기반) 또는 텍스트 Input → fieldValues 병합
 *   - 전압: 인라인 Input → stageCableUpdate specParams 병합 (IN 케이블 없으면 '—')
 *   - peer: 선번장과 동일(원격 Badge)
 *   - 행 클릭 → onSelectAsset(feederId)
 */
import { useMemo, useState } from 'react';
import { EmptyState, Select, TableCard, Th, cn, SELECTABLE } from '../../components/ui';
import { mergeEffective } from '../store/overlay';
import { useV2WorkingCopy } from '../store/workingCopyStore';
import { powerContainers, buildPowerRows } from '../powerSelectors';
import type { PowerRow } from '../powerSelectors';
import { useV2Catalog, useTypesById } from '../hooks';
import { AddAssetModal } from './AddAssetModal';
import type { FieldDef } from '@twin/core';
import { PeerCell } from './PeerCell';
import { InlineEditCell } from './InlineEditCell';

interface Props {
  substationId: string;
  selectedAssetId: string | null;
  onSelectAsset: (id: string | null) => void;
}

// PeerCell은 공용 컴포넌트 사용 (M-2 — FiberRegisterView와 공유)

// ── 차단기 번호 인라인 편집 ───────────────────────────────────────────────────
interface BreakerInputProps {
  feederId: string;
  value: string | null;
}

function BreakerInput({ feederId, value }: BreakerInputProps) {
  function handleCommit(raw: string) {
    // 무변경 가드: 커밋 시점 getState로 현재 fieldValues 읽기 (stale 클로저 방지)
    const current =
      useV2WorkingCopy.getState().effectiveAssets().find((a) => a.id === feederId)?.fieldValues ?? {};
    const next = raw.trim();
    if (String(current['breakerNo'] ?? '') === next) return;
    useV2WorkingCopy.getState().stageAssetUpdate(feederId, {
      fieldValues: { ...current, breakerNo: next },
    });
  }

  return <InlineEditCell value={value ?? ''} onCommit={handleCommit} />;
}

// ── 스위치 상태 편집 셀 ───────────────────────────────────────────────────────
interface SwitchStateCellProps {
  feederId: string;
  value: string | null;
  switchStateDef: FieldDef | null;
}

function SwitchStateCell({ feederId, value, switchStateDef }: SwitchStateCellProps) {
  function handleCommit(next: string) {
    const current =
      useV2WorkingCopy.getState().effectiveAssets().find((a) => a.id === feederId)?.fieldValues ?? {};
    if (String(current['switchState'] ?? '') === next) return;
    useV2WorkingCopy.getState().stageAssetUpdate(feederId, {
      fieldValues: { ...current, switchState: next },
    });
  }

  // catalog에 switchState select fieldDef가 있으면 Select, 없으면 텍스트 Input
  const options =
    switchStateDef && switchStateDef.type === 'select' && switchStateDef.options
      ? switchStateDef.options
      : undefined;

  return <InlineEditCell value={value ?? ''} onCommit={handleCommit} options={options} />;
}

// ── 전압 인라인 편집 (IN 케이블 없으면 '—' 비편집) ──────────────────────────
interface VoltageInputProps {
  cableId: string | null;
  voltage: string | null;
}

function VoltageInput({ cableId, voltage }: VoltageInputProps) {
  if (!cableId) return <span className="text-content-faint">—</span>;

  const resolvedCableId: string = cableId;

  function handleCommit(raw: string) {
    const effectiveCables = useV2WorkingCopy.getState().effectiveCables();
    const cable = effectiveCables.find((c) => c.id === resolvedCableId);
    if (!cable) return;

    const existingParams = cable.specParams ?? {};
    const next = raw.trim() || null;
    const current = (existingParams['voltage'] as string | null) ?? null;
    if (current === next) return;

    useV2WorkingCopy.getState().stageCableUpdate(resolvedCableId, {
      specParams: { ...existingParams, voltage: next },
    });
  }

  return <InlineEditCell value={voltage ?? ''} onCommit={handleCommit} />;
}

// ── 메인 뷰 ──────────────────────────────────────────────────────────────────
export function PowerRegisterView({ substationId: _substationId, selectedAssetId, onSelectAsset }: Props) {
  const saved = useV2WorkingCopy((s) => s.saved);
  const overlays = useV2WorkingCopy((s) => s.overlays);

  const effectiveAssets = useMemo(
    () => mergeEffective(saved.assets, overlays.assets),
    [saved, overlays],
  );
  const effectiveCables = useMemo(
    () => mergeEffective(saved.cables, overlays.cables),
    [saved, overlays],
  );

  const containers = useMemo(() => powerContainers(effectiveAssets), [effectiveAssets]);

  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);

  // 선택된 컨테이너 (null이면 첫 번째)
  const activeContainerId =
    selectedContainerId !== null && containers.some((c) => c.id === selectedContainerId)
      ? selectedContainerId
      : containers[0]?.id ?? null;

  const activeContainer = containers.find((c) => c.id === activeContainerId) ?? null;

  // catalog에서 피더별 switchState fieldDef 조회 (행별 해소 — 혼합 타입 컨테이너 대응)
  const catalog = useV2Catalog();
  const typesById = useTypesById(catalog.data?.types);

  /* 회로 수 = 이 함체가 선언한 전원 컨테이너의 slotCount.
     선언돼 있으면 빈 자리까지 표(패널 스케줄)에 나오고, 자유형이면 있는 것만 나온다.
     "몇 회로짜리인가" 는 타입이 아니라 명세가 말한다 — 코드는 분전반을 모르지 않는다. */
  const circuitSpec = useMemo(() => {
    if (!activeContainer) return null;
    const type = typesById.get(activeContainer.typeId);
    return type?.containerSpecs[0] ?? null;
  }, [activeContainer, typesById]);
  const circuitCount = circuitSpec?.slotCount ?? null;

  /* 빈 회로 자리를 누르면 그 자리에 자산을 넣는다 — 모달은 이 뷰가 소유한다
     (평면도가 배치 모달을 직접 다루는 것과 같은 규칙). */
  const [addSlotIndex, setAddSlotIndex] = useState<number | null>(null);

  const rows = useMemo<PowerRow[]>(() => {
    if (!activeContainer) return [];
    return buildPowerRows(activeContainer, effectiveAssets, effectiveCables, circuitCount);
  }, [activeContainer, effectiveAssets, effectiveCables, circuitCount]);

  const switchStateDefByFeeder = useMemo<Map<string, FieldDef | null>>(() => {
    const map = new Map<string, FieldDef | null>();
    for (const row of rows) {
      const feeder = effectiveAssets.find((a) => a.id === row.feederId);
      const type = feeder ? typesById.get(feeder.typeId) : undefined;
      map.set(row.feederId, type?.fieldDefs.find((fd) => fd.key === 'switchState') ?? null);
    }
    return map;
  }, [rows, effectiveAssets, typesById]);

  // ── 빈 상태 ────────────────────────────────────────────────────────────────
  if (containers.length === 0) {
    return (
      <EmptyState
        title="계통에 표시할 전원 자산이 없습니다"
        description={
          <>
            계통은 <strong>전원 포트를 가진 자산을 품고 있는 함체</strong>를 자동으로 찾습니다. 분전반 같은 함체를 만들고
            그 안에 피더를 넣으면 여기에 나타납니다.
          </>
        }
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* 상단 컨테이너 선택 */}
      <div className="shrink-0 border-b border-line px-3 py-2">
        <Select
          value={activeContainerId ?? ''}
          size="sm" className="max-w-xs"
          onChange={(e) => setSelectedContainerId(e.currentTarget.value || null)}
        >
          {containers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {/* 테이블 */}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <TableCard widths={[8, 20, 13, 11, 24, 24]}>
          <thead>
            <tr className="border-b border-line">
              {/* 회로 번호가 맨 앞 — 패널 스케줄에서 번호는 곧 패널에서의 자리다. */}
              <Th>회로</Th>
              <Th>피더</Th>
              <Th>차단기 번호</Th>
              <Th>상태</Th>
              <Th>전원 입력</Th>
              <Th>부하 출력</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-content-faint">
                  피더 데이터가 없습니다
                </td>
              </tr>
            )}
            {rows.map((row) =>
              /* 빈 회로 자리 — 패널 스케줄의 SPARE. 눌러서 그 자리에 피더를 넣는다
                 (수용 UI 의 '비어 있음' 행과 같은 규칙). */
              row.empty ? (
                <tr key={`empty-${row.slotNo}`} className="border-b border-line">
                  <td className="px-3 py-1.5 text-sm text-content-faint tabular-nums">{row.slotNo}</td>
                  <td colSpan={5} className="px-3 py-1.5">
                    <button
                      type="button"
                      className={cn(
                        'w-full rounded border border-dashed border-line px-2 py-1 text-left text-sm text-content-faint',
                        SELECTABLE,
                      )}
                      onClick={() => setAddSlotIndex(row.slotNo! - 1)}
                    >
                      비어 있음
                      <span className="ml-2 text-xs text-primary">+ 추가</span>
                    </button>
                  </td>
                </tr>
              ) : (
              <tr
                key={row.feederId}
                className={`cursor-pointer border-b border-line hover:bg-surface-2 ${
                  selectedAssetId === row.feederId ? 'bg-surface-2' : ''
                }`}
                onClick={() => onSelectAsset(row.feederId)}
              >
                <td className="px-3 py-1.5 text-sm text-content-muted tabular-nums">{row.slotNo ?? '—'}</td>
                {/* 피더 이름 */}
                <td className="px-3 py-1.5 text-sm text-content">{row.feederName}</td>

                {/* 차단기 번호 인라인 편집 */}
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <BreakerInput feederId={row.feederId} value={row.breakerNo} />
                </td>

                {/* 스위치 상태 편집 */}
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <SwitchStateCell
                    feederId={row.feederId}
                    value={row.switchState}
                    switchStateDef={switchStateDefByFeeder.get(row.feederId) ?? null}
                  />
                </td>

                {/* 전원 입력: peer + 전압 */}
                <td className="px-3 py-1.5">
                  <div className="flex flex-col gap-1">
                    <PeerCell peer={row.inCell.peer} />
                    <div onClick={(e) => e.stopPropagation()}>
                      <VoltageInput cableId={row.inCell.cableId} voltage={row.inCell.voltage} />
                    </div>
                  </div>
                </td>

                {/* 부하 출력: peer */}
                <td className="px-3 py-1.5">
                  <PeerCell peer={row.outCell.peer} />
                </td>
              </tr>
              ),
            )}
          </tbody>
        </TableCard>
      </div>

      {/* 회로 자리에 자산 추가 */}
      {addSlotIndex != null && activeContainer && circuitSpec && (
        <AddAssetModal
          open
          onClose={() => setAddSlotIndex(null)}
          substationId={_substationId}
          containerContext={{
            parentAssetId: activeContainer.id,
            spec: circuitSpec,
            siblings: effectiveAssets
              .filter((a) => a.parentAssetId === activeContainer.id)
              .map((a) => ({ slotIndex: a.slotIndex, slotSpan: a.slotSpan })),
            slotIndex: addSlotIndex,
          }}
        />
      )}
    </div>
  );
}
