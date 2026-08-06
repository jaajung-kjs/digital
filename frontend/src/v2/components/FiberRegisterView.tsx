/**
 * FiberRegisterView — 선번장 뷰
 *
 * 상단: 컨테이너(광 포트를 가진 자산) Select
 * 테이블: 슬롯 그룹헤더 행 + 코어별 데이터 행
 *   컬럼: 코어 | {groups 동적} | 길이(m) | 손실(dB) | 점검일
 * 메타 인라인 편집: blur/Enter, 무변경 가드
 */
import { Fragment, useMemo, useState } from 'react';
import { EmptyState, Select, TableCard, TableSearch, Th } from '../../components/ui';
import { mergeEffective } from '../store/overlay';
import { useV2WorkingCopy } from '../store/workingCopyStore';
import { useV2Catalog, useTypesById } from '../hooks';
import { useMediumContainer } from '../useMediumContainer';
import { fiberContainers, buildFiberRows } from '../fiberSelectors';
import type { FiberRow } from '../fiberSelectors';
import { PeerCell } from './PeerCell';
import { InlineEditCell } from './InlineEditCell';

interface Props {
  substationId: string;
  selectedAssetId: string | null;
  onSelectAsset: (id: string | null) => void;
}

// ── 메타 셀 인라인 편집 ───────────────────────────────────────────────────────
interface MetaInputProps {
  value: number | string | null;
  type: 'number' | 'date';
  cableId: string | null;
  fieldKey: 'lengthM' | 'lossDb' | 'inspectedAt';
}

function MetaInput({ value, type, cableId, fieldKey }: MetaInputProps) {
  // cableId 없으면 비편집 대시
  if (!cableId) return <span className="text-content-faint">—</span>;

  // After the null-guard, capture as string for TypeScript narrowing in closures
  const resolvedCableId: string = cableId;
  const displayValue = value !== null && value !== undefined ? String(value) : '';

  function handleCommit(raw: string) {
    // 무변경 가드: 렌더 시점의 effective 케이블 읽기 (stale 클로저 방지)
    const effectiveCables = useV2WorkingCopy.getState().effectiveCables();
    const cable = effectiveCables.find((c) => c.id === resolvedCableId);
    if (!cable) return;

    const existingParams = cable.specParams ?? {};

    if (fieldKey === 'inspectedAt') {
      const current = (existingParams[fieldKey] as string | null) ?? null;
      const next = raw.trim() || null;
      if (current === next) return;
      useV2WorkingCopy.getState().stageCableUpdate(resolvedCableId, {
        specParams: { ...existingParams, [fieldKey]: next },
      });
    } else {
      // number field
      const current = (existingParams[fieldKey] as number | null) ?? null;
      const next = raw.trim() === '' ? null : Number(raw);
      if (Number.isNaN(next as number) && raw.trim() !== '') return; // invalid input → ignore
      // Compare: both null or equal numbers
      if (current === next) return;
      useV2WorkingCopy.getState().stageCableUpdate(resolvedCableId, {
        specParams: { ...existingParams, [fieldKey]: next },
      });
    }
  }

  return <InlineEditCell value={displayValue} onCommit={handleCommit} type={type} />;
}

// PeerCell은 공용 컴포넌트로 추출 (M-2 — PowerRegisterView와 공유)

// ── 메인 뷰 ──────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function FiberRegisterView({ substationId: _substationId, selectedAssetId, onSelectAsset }: Props) {
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

  const containers = useMemo(() => fiberContainers(effectiveAssets), [effectiveAssets]);

  // lineSide 선언 판독을 위한 카탈로그 타입 (meta 케이블 선정 — A-V1)
  const catalog = useV2Catalog();
  const types = catalog.data?.types;
  const typesById = useTypesById(types);

  const [query, setQuery] = useState('');

  /* 표의 단위는 자산이 아니라 (자산, 컨테이너) — 계통과 같은 훅을 쓴다. */
  const picked = useMediumContainer(containers, typesById);
  const activeContainer = picked.active;

  const { groups, rows } = useMemo(() => {
    if (!activeContainer) return { groups: [] as string[], rows: [] as FiberRow[] };
    return buildFiberRows(
      activeContainer.asset, effectiveAssets, effectiveCables, types ?? [], activeContainer.containerKey,
    );
  }, [activeContainer, effectiveAssets, effectiveCables, types]);

  // ── 빈 상태 ────────────────────────────────────────────────────────────────
  if (containers.length === 0) {
    return (
      <EmptyState
        title="선번장에 표시할 광 자산이 없습니다"
        description={
          <>
            선번장은 <strong>광 포트를 가진 자산을 품고 있는 함체</strong>를 자동으로 찾습니다. OFD 같은 함체를 만들고
            그 안에 광슬롯을 넣으면 여기에 나타납니다.
          </>
        }
      />
    );
  }

  /* 슬롯 4개 × 코어 24심이면 96행이다 — 검색이 없으면 "그 대국" 을 눈으로 훑어야 한다.
     슬롯 이름과 각 칸의 대국(자산·포트)을 훑는다. 슬롯 이름이 걸리면 그 슬롯의 심이
     통째로 남는다 — "슬롯 3" 을 찾는 사람은 그 판 전체를 보려는 것이다. */
  const filteredRows = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      if (r.slotName.toLowerCase().includes(q)) return true;
      return r.cells.some((c) =>
        c.peer ? `${c.peer.assetName} ${c.peer.portName}`.toLowerCase().includes(q) : false,
      );
    });
  })();

  // ── 슬롯별 그룹화: 테이블 렌더를 위해 슬롯 변경 지점 찾기 ──────────────
  // rows는 slot 순서로 정렬되어 있음 (buildFiberRows 내부 sort)
  type RowGroup = { slotId: string; slotName: string; rows: FiberRow[] };
  const rowGroups: RowGroup[] = [];
  for (const row of filteredRows) {
    const last = rowGroups[rowGroups.length - 1];
    if (!last || last.slotId !== row.slotId) {
      rowGroups.push({ slotId: row.slotId, slotName: row.slotName, rows: [row] });
    } else {
      last.rows.push(row);
    }
  }

  // 컬럼 수: 코어 + groups.length + 3 (길이, 손실, 점검일)
  const totalCols = 1 + groups.length + 3;

  // 코어·수치 열은 좁게 고정, 대국 그룹 열이 남는 폭을 나눠 갖는다(합 100).
  const fiberWidths = [8, ...groups.map(() => (100 - 8 - 36) / Math.max(groups.length, 1)), 12, 12, 12];

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
          aria-label="심 검색"
          placeholder="슬롯 · 대국 자산 · 포트 검색"
          value={query}
          onChange={setQuery}
          shown={filteredRows.length}
          total={rows.length}
        />
      </div>

      {/* 테이블 */}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <TableCard widths={fiberWidths}>
          <thead>
            <tr className="border-b border-line">
              <Th>코어</Th>
              {groups.map((g) => (
                <Th key={g}>{g}</Th>
              ))}
              <Th>길이(m)</Th>
              <Th>손실(dB)</Th>
              <Th>점검일</Th>
            </tr>
          </thead>
          <tbody>
            {rowGroups.length === 0 && (
              <tr>
                <td
                  colSpan={totalCols}
                  className="px-3 py-6 text-center text-sm text-content-faint"
                >
                  {query.trim() ? `'${query.trim()}' 와 맞는 심이 없습니다` : '슬롯 데이터가 없습니다'}
                </td>
              </tr>
            )}
            {rowGroups.map(({ slotId, slotName, rows: slotRows }) => (
              <Fragment key={slotId}>
                {/* 슬롯 그룹헤더 행 */}
                <tr className="bg-surface-2">
                  <td
                    colSpan={totalCols}
                    className="px-3 py-1 text-xs font-medium text-content-muted"
                  >
                    {slotName}
                  </td>
                </tr>
                {/* 코어 데이터 행 */}
                {slotRows.map((row) => (
                  <tr
                    key={`${row.slotId}-${row.coreIndex}`}
                    className={`cursor-pointer border-b border-line hover:bg-surface-2 ${
                      selectedAssetId === row.slotId ? 'bg-surface-2' : ''
                    }`}
                    onClick={() => onSelectAsset(row.slotId)}
                  >
                    {/* 코어 번호 */}
                    <td className="px-3 py-1.5 text-sm text-content-muted">{row.coreIndex}</td>
                    {/* 그룹별 피어 셀 */}
                    {row.cells.map((cell) => (
                      <td key={cell.group} className="px-3 py-1.5">
                        <PeerCell peer={cell.peer} />
                      </td>
                    ))}
                    {/* 메타: 길이 */}
                    <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <MetaInput
                        value={row.meta.lengthM}
                        type="number"
                        cableId={row.meta.cableId}
                        fieldKey="lengthM"
                      />
                    </td>
                    {/* 메타: 손실 */}
                    <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <MetaInput
                        value={row.meta.lossDb}
                        type="number"
                        cableId={row.meta.cableId}
                        fieldKey="lossDb"
                      />
                    </td>
                    {/* 메타: 점검일 */}
                    <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <MetaInput
                        value={row.meta.inspectedAt}
                        type="date"
                        cableId={row.meta.cableId}
                        fieldKey="inspectedAt"
                      />
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </TableCard>
      </div>
    </div>
  );
}
