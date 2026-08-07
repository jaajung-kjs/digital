/**
 * PowerRegisterView — 계통 뷰
 *
 * 상단: 컨테이너(전원 포트를 가진 자산) Select
 * 테이블 컬럼: 회로 | 피더 | 상태 | 전원 입력(peer) | 전압 | 부하 출력(peer)
 *   - 상태: catalog fieldDefs switchState Select(옵션 데이터 기반) 또는 텍스트 Input → fieldValues 병합
 *   - 전압: 인라인 Input → stageCableUpdate specParams 병합 (IN 케이블 없으면 '—')
 *   - peer: 선번장과 동일(원격 Badge)
 *   - 행 클릭 → onSelectAsset(feederId)
 */
import { useMemo, useState } from 'react';
import { EmptyState, Select, TableCard, TableSearch, Th, cn, SELECTABLE, SELECTED } from '../../components/ui';
import { mergeEffective } from '../store/overlay';
import { useV2WorkingCopy } from '../store/workingCopyStore';
import { powerContainers, buildPowerRows } from '../powerSelectors';
import type { PowerRow, PowerCell } from '../powerSelectors';
import { useV2Catalog, useTypesById } from '../hooks';
import { useMediumContainer } from '../useMediumContainer';
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

  // catalog에서 피더별 switchState fieldDef 조회 (행별 해소 — 혼합 타입 컨테이너 대응)
  const catalog = useV2Catalog();
  const typesById = useTypesById(catalog.data?.types);

  /* 어느 컨테이너를 보고 있나 + 그 컨테이너가 선언한 회로 수.
     회로 수가 선언돼 있으면 빈 자리까지 표(패널 스케줄)에 나오고, 자유형이면 있는 것만 나온다.
     "몇 회로짜리인가" 는 타입이 아니라 명세가 말한다 — 코드는 분전반을 모르지 않는다. */
  const picked = useMediumContainer(containers, typesById);
  const activeContainer = picked.active;
  const circuitCount = picked.slotCount;

  /* 빈 회로 자리를 누르면 그 자리에 자산을 넣는다 — 모달은 이 뷰가 소유한다
     (평면도가 배치 모달을 직접 다루는 것과 같은 규칙). */
  const [addSlotIndex, setAddSlotIndex] = useState<number | null>(null);

  const rows = useMemo<PowerRow[]>(() => {
    if (!activeContainer) return [];
    return buildPowerRows(
      activeContainer.asset, effectiveAssets, effectiveCables, circuitCount, activeContainer.containerKey,
    );
  }, [activeContainer, effectiveAssets, effectiveCables, circuitCount]);

  /* 검색이 없으면 회로가 42개인 분전반에서 "그 피더" 를 찾을 방법이 눈으로 훑는 것뿐이다.
     표에 보이는 값을 통째로 훑는다 — 사용자는 이름만 기억하지 그것이 몇 번째 열인지는 모른다.
     빈 회로 자리(SPARE)는 검색 중에는 감춘다. 아무 글자와도 맞지 않는데 남아 있으면
     결과 사이에 빈 줄만 늘어놓는 셈이 된다. */
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    const peerText = (cell: PowerCell) =>
      cell.peer ? `${cell.peer.assetName} ${cell.peer.portName}` : '';
    return rows.filter(
      (r) =>
        !r.empty &&
        [r.feederName, peerText(r.inCell), peerText(r.outCell)].some((v) =>
          v.toLowerCase().includes(q),
        ),
    );
  }, [rows, query]);

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
      {/* 상단 컨테이너 선택 + 검색 */}
      <div className="shrink-0 flex items-center gap-3 border-b border-line px-3 py-2">
        {/* 폭은 **감싸는 칸**이 정한다 — `<select>` 에 직접 걸면 화살표(래퍼 기준 절대배치)만
            멀찍이 떨어져 남는다. 실제로 그렇게 돼 있었다. */}
        <div className="w-64 shrink-0">
          <Select value={picked.activeKey} size="sm" onChange={(e) => picked.setActiveKey(e.currentTarget.value)}>
            {picked.options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <TableSearch
          aria-label="회로 검색"
          placeholder="피더 · 차단기 번호 · 연결 자산 검색"
          value={query}
          onChange={setQuery}
          shown={filtered.length}
          total={rows.length}
        />
      </div>

      {/* 테이블 */}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <TableCard widths={[8, 24, 12, 24, 10, 22]}>
          <thead>
            <tr className="border-b border-line">
              {/* 회로 번호가 맨 앞 — 패널 스케줄에서 번호는 곧 패널에서의 자리다.
                  그래서 '차단기 번호' 열은 두지 않는다: 같은 것을 두 번 적는 셈이었다
                  (필드 자체는 남아 있어 자산 상세에서 적을 수 있다). */}
              <Th>회로</Th>
              <Th>피더</Th>
              <Th>상태</Th>
              <Th>전원 입력</Th>
              {/* 전압은 제 열을 갖는다 — 대국 아래에 끼워 넣으니 그 행만 두 줄이 되어
                  표의 행 높이가 43~63px 로 들쭉날쭉했다. */}
              <Th>전압</Th>
              <Th>부하 출력</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-content-faint">
                  {query.trim() ? `'${query.trim()}' 와 맞는 회로가 없습니다` : '피더 데이터가 없습니다'}
                </td>
              </tr>
            )}
            {filtered.map((row) =>
              /* 빈 회로 자리 — 패널 스케줄의 SPARE. 눌러서 그 자리에 피더를 넣는다
                 (수용 UI 의 '비어 있음' 행과 같은 규칙). */
              row.empty ? (
                /* 빈 자리도 **같은 격자** 위에 있어야 한다 — 예전에는 표 폭을 통째로 가로지르는
                   점선 상자여서 행 경계선과 겹쳐 보이고 열 정렬이 끊겼다.
                   '추가' 는 손이 닿을 때만 뜨되 자리는 미리 비워 둔다(§1.7 — 안 그러면 행이 떤다). */
                <tr
                  key={`empty-${row.slotNo}`}
                  className={cn('group h-11 border-b border-line', SELECTABLE)}
                  onClick={() => setAddSlotIndex(row.slotNo! - 1)}
                >
                  <td className="px-3 py-1.5 text-sm text-content-faint tabular-nums">{row.slotNo}</td>
                  <td className="px-3 py-1.5 text-sm text-content-faint">
                    비어 있음
                    <span className="ml-2 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      + 추가
                    </span>
                  </td>
                  <td colSpan={4} />
                </tr>
              ) : (
              <tr
                key={row.feederId}
                /* 모든 행이 같은 높이 — 패널 스케줄은 눈으로 회로를 세는 표다. 빈 자리 행에는
                   컨트롤이 없어 10px 낮았고, 그 바람에 번호 간격이 들쭉날쭉했다. */
                className={cn(
                  'h-11 border-b border-line',
                  SELECTABLE,
                  selectedAssetId === row.feederId && SELECTED,
                )}
                onClick={() => onSelectAsset(row.feederId)}
              >
                <td className="px-3 py-1.5 text-sm text-content-muted tabular-nums">{row.slotNo ?? '—'}</td>
                <td className="truncate px-3 py-1.5 text-sm text-content">{row.feederName}</td>

                {/* 스위치 상태 편집 */}
                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <SwitchStateCell
                    feederId={row.feederId}
                    value={row.switchState}
                    switchStateDef={switchStateDefByFeeder.get(row.feederId) ?? null}
                  />
                </td>

                <td className="truncate px-3 py-1.5">
                  <PeerCell peer={row.inCell.peer} />
                </td>

                <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                  <VoltageInput cableId={row.inCell.cableId} voltage={row.inCell.voltage} />
                </td>

                <td className="truncate px-3 py-1.5">
                  <PeerCell peer={row.outCell.peer} />
                </td>
              </tr>
              ),
            )}
          </tbody>
        </TableCard>
      </div>

      {/* 회로 자리에 자산 추가 */}
      {addSlotIndex != null && activeContainer && picked.spec && (
        <AddAssetModal
          open
          onClose={() => setAddSlotIndex(null)}
          substationId={_substationId}
          containerContext={{
            parentAssetId: activeContainer.asset.id,
            spec: picked.spec,
            // 자리 점유는 **같은 컨테이너 안에서만** 따진다 — 다른 컨테이너의 0번은 남의 자리다.
            siblings: effectiveAssets
              .filter(
                (a) =>
                  a.parentAssetId === activeContainer.asset.id &&
                  a.containerKey === activeContainer.containerKey,
              )
              .map((a) => ({ slotIndex: a.slotIndex, slotSpan: a.slotSpan })),
            slotIndex: addSlotIndex,
          }}
        />
      )}
    </div>
  );
}
