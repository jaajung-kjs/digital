/**
 * FiberRegisterView — 선번장 뷰
 *
 * 상단: 컨테이너(광 포트를 가진 자산) Select
 * 테이블: 슬롯 그룹헤더 행 + 코어별 데이터 행
 *   컬럼: 코어 | {groups 동적} | 길이(m) | 손실(dB) | 점검일
 * 메타 인라인 편집: blur/Enter, 무변경 가드
 */
import { Fragment, useMemo, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui';
import { mergeEffective } from '../store/overlay';
import { useV2WorkingCopy } from '../store/workingCopyStore';
import { fiberContainers, buildFiberRows } from '../fiberSelectors';
import type { FiberRow } from '../fiberSelectors';

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
      if (next === null) {
        // remove key by setting null
        useV2WorkingCopy.getState().stageCableUpdate(resolvedCableId, {
          specParams: { ...existingParams, [fieldKey]: null },
        });
      } else {
        useV2WorkingCopy.getState().stageCableUpdate(resolvedCableId, {
          specParams: { ...existingParams, [fieldKey]: next },
        });
      }
    }
  }

  return (
    <input
      type={type}
      className="w-full min-w-0 rounded border border-line bg-transparent px-1 py-0.5 text-sm text-content focus:border-primary focus:outline-none"
      defaultValue={displayValue}
      key={displayValue} // reset on external change
      onBlur={(e) => handleCommit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

// ── 피어 셀 표시 ─────────────────────────────────────────────────────────────
interface PeerCellProps {
  peer: FiberRow['cells'][number]['peer'];
}

function PeerCell({ peer }: PeerCellProps) {
  if (!peer) return <span className="text-content-faint">—</span>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span className="text-sm text-content">
        {peer.assetName} · {peer.portName}
      </span>
      {peer.remote && peer.substationName && (
        <Badge status="info">{peer.substationName}</Badge>
      )}
    </span>
  );
}

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

  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);

  // 선택된 컨테이너 (null이면 첫 번째)
  const activeContainerId =
    selectedContainerId !== null && containers.some((c) => c.id === selectedContainerId)
      ? selectedContainerId
      : containers[0]?.id ?? null;

  const activeContainer = containers.find((c) => c.id === activeContainerId) ?? null;

  const { groups, rows } = useMemo(() => {
    if (!activeContainer) return { groups: [] as string[], rows: [] as FiberRow[] };
    return buildFiberRows(activeContainer, effectiveAssets, effectiveCables);
  }, [activeContainer, effectiveAssets, effectiveCables]);

  // ── 빈 상태 ────────────────────────────────────────────────────────────────
  if (containers.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-content-faint">광 포트를 가진 자산이 없습니다</p>
      </div>
    );
  }

  // ── 슬롯별 그룹화: 테이블 렌더를 위해 슬롯 변경 지점 찾기 ──────────────
  // rows는 slot 순서로 정렬되어 있음 (buildFiberRows 내부 sort)
  type RowGroup = { slotId: string; slotName: string; rows: FiberRow[] };
  const rowGroups: RowGroup[] = [];
  for (const row of rows) {
    const last = rowGroups[rowGroups.length - 1];
    if (!last || last.slotId !== row.slotId) {
      rowGroups.push({ slotId: row.slotId, slotName: row.slotName, rows: [row] });
    } else {
      last.rows.push(row);
    }
  }

  // 컬럼 수: 코어 + groups.length + 3 (길이, 손실, 점검일)
  const totalCols = 1 + groups.length + 3;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* 상단 컨테이너 선택 */}
      <div className="shrink-0 border-b border-line px-3 py-2">
        <Select
          value={activeContainerId ?? ''}
          className="max-w-xs py-0.5 text-sm"
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
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="px-3 py-2 text-left text-xs font-medium text-content-muted">코어</th>
              {groups.map((g) => (
                <th
                  key={g}
                  className="px-3 py-2 text-left text-xs font-medium text-content-muted"
                >
                  {g}
                </th>
              ))}
              <th className="px-3 py-2 text-left text-xs font-medium text-content-muted">
                길이(m)
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-content-muted">
                손실(dB)
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-content-muted">
                점검일
              </th>
            </tr>
          </thead>
          <tbody>
            {rowGroups.length === 0 && (
              <tr>
                <td
                  colSpan={totalCols}
                  className="px-3 py-6 text-center text-sm text-content-faint"
                >
                  슬롯 데이터가 없습니다
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
        </table>
      </div>
    </div>
  );
}
