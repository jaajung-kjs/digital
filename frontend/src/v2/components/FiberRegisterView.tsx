/**
 * FiberRegisterView — 선번장 뷰
 *
 * 상단: 컨테이너(광 포트를 가진 자산) Select
 * 테이블: 슬롯 그룹헤더 행 + 코어별 데이터 행
 *   컬럼: 코어 | {groups 동적} | 길이(m) | 손실(dB) | 점검일
 * 메타 인라인 편집: blur/Enter, 무변경 가드
 */
import { Fragment, useMemo, useState } from 'react';
import { EmptyState, Select, TableCard, TableSearch, Th, cn, SELECTABLE, SELECTED } from '../../components/ui';
import { mergeEffective } from '../store/overlay';
import { useV2WorkingCopy } from '../store/workingCopyStore';
import { useV2Catalog, useTypesById } from '../hooks';
import { cableFieldsFor, portFieldsFor, portValuesAt, setPortValueAt, type CableFieldDef } from '@twin/core';
import { useMediumContainer } from '../useMediumContainer';
import { fiberContainers, buildFiberRows, FIBER_TRUNK_MEDIUM } from '../fiberSelectors';
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
  value: unknown;
  /** 어떤 값을 적는 칸인지 — 키·자료형이 여기서 나온다. 화면이 키를 알지 않는다. */
  field: CableFieldDef;
  cableId: string | null;
}

function MetaInput({ value, field, cableId }: MetaInputProps) {
  const { key: fieldKey, type } = field;
  // cableId 없으면 비편집 대시
  if (!cableId) return <span className="text-content-faint">—</span>;

  // After the null-guard, capture as string for TypeScript narrowing in closures
  const resolvedCableId: string = cableId;
  const displayValue = value !== null && value !== undefined ? String(value) : '';
  const isNumber = type === 'number';

  function handleCommit(raw: string) {
    // 무변경 가드: 렌더 시점의 effective 케이블 읽기 (stale 클로저 방지)
    const effectiveCables = useV2WorkingCopy.getState().effectiveCables();
    const cable = effectiveCables.find((c) => c.id === resolvedCableId);
    if (!cable) return;

    const existingParams = cable.specParams ?? {};

    // 숫자 칸만 수로 바꿔 담는다 — 나머지(글자·날짜)는 적힌 그대로다.
    const next = isNumber
      ? (raw.trim() === '' ? null : Number(raw))
      : (raw.trim() || null);
    if (isNumber && typeof next === 'number' && Number.isNaN(next)) return; // 숫자가 아니면 무시
    const current = existingParams[fieldKey] ?? null;
    if (current === next) return; // 무변경 가드
    useV2WorkingCopy.getState().stageCableUpdate(resolvedCableId, {
      specParams: { ...existingParams, [fieldKey]: next },
    });
  }

  return <InlineEditCell value={displayValue} onCommit={handleCommit} type={isNumber ? 'number' : 'date'} />;
}

// ── 심선 값 인라인 편집 ───────────────────────────────────────────────────────
/**
 * 손실·점검일처럼 **심선마다 다른** 값은 케이블이 아니라 포트에 담긴다.
 *
 * 예전에는 케이블에 담았는데, 그러려면 OPGW 한 가닥을 심선 수만큼 케이블로 복제해야 했고
 * 그 탓에 설계서 공량이 그 배로 부풀었다(40m 4심 → 160m). 그리고 아직 이어지지 않은 심선에는
 * 케이블이 없어 성단 손실을 적을 곳조차 없었다.
 *
 * 포트는 타입 명세가 만드는 것이라 생성·삭제가 없고 값만 바뀐다 — 그래서 자산 패치에 얹는다
 * (별도 OCC 축을 만들지 않는다).
 */
function PortFieldInput({
  value, field, portId, assetId, position,
}: { value: unknown; field: CableFieldDef; portId: string | null; assetId: string | null; position: number }) {
  if (!portId || !assetId) return <span className="text-content-faint">—</span>;
  const resolvedPortId: string = portId;
  const resolvedAssetId: string = assetId;
  const isNumber = field.type === 'number';
  const shown = value === null || value === undefined ? '' : String(value);

  function handleCommit(raw: string) {
    const asset = useV2WorkingCopy.getState().effectiveAssets().find((a) => a.id === resolvedAssetId);
    const port = asset?.ports.find((p) => p.id === resolvedPortId);
    if (!asset || !port) return;

    const next = isNumber ? (raw.trim() === '' ? null : Number(raw)) : (raw.trim() || null);
    if (isNumber && typeof next === 'number' && Number.isNaN(next)) return;
    const current = portValuesAt(port, position)[field.key] ?? null;
    if (current === next) return; // 무변경 가드

    /* 포트 배열째로 스테이지한다 — 화면(effective)이 곧바로 새 값을 보여야 하고,
       커밋 페이로드는 이 배열에서 `portFieldValues` 를 뽑아 낸다.
       다심 포트의 저장 형상(코어 번호 중첩)을 아는 곳은 `setPortValueAt` 하나뿐이다. */
    const ports = asset.ports.map((p) =>
      p.id === resolvedPortId ? { ...p, fieldValues: setPortValueAt(p, position, field.key, next) } : p,
    );
    useV2WorkingCopy.getState().stageAssetUpdate(resolvedAssetId, { ports });
  }

  return <InlineEditCell value={shown} onCommit={handleCommit} type={isNumber ? 'number' : 'date'} />;
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

  // 컨테이너 이름표를 만드는 데 쓰는 카탈로그 타입(useMediumContainer)
  const catalog = useV2Catalog();
  const types = catalog.data?.types;
  const typesById = useTypesById(types);

  const [query, setQuery] = useState('');

  /* 표의 단위는 자산이 아니라 (자산, 컨테이너) — 계통과 같은 훅을 쓴다. */
  const picked = useMediumContainer(containers, typesById);
  const activeContainer = picked.active;

  const { groups, groupLabels, rows } = useMemo(() => {
    if (!activeContainer) return { groups: [] as string[], groupLabels: [] as string[], rows: [] as FiberRow[] };
    return buildFiberRows(
      activeContainer.asset, effectiveAssets, effectiveCables, activeContainer.containerKey,
    );
  }, [activeContainer, effectiveAssets, effectiveCables]);

  // ── 빈 상태 ────────────────────────────────────────────────────────────────
  if (containers.length === 0) {
    return (
      <EmptyState
        title="선번장에 표시할 광 자산이 없습니다"
        description={
          <>
            선번장은 <strong>광 인입 포트를 가진 자산을 품고 있는 함체</strong>를 자동으로 찾습니다. OFD 같은 함체를
            만들고 그 안에 경로슬롯을 넣으면 여기에 나타납니다.
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
      const hit = (p: { assetName: string; portName: string } | null) =>
        p ? `${p.assetName} ${p.portName}`.toLowerCase().includes(q) : false;
      return r.cells.some((c) => hit(c.peer)) || hit(r.farEnd);
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

  /* 인입에 적는 값 — 무엇이 케이블의 것이고 무엇이 심선의 것인지는 종류 선언이 정한다.
     장비쪽 광 포트에는 이 값들이 아예 선언돼 있지 않다(OTDR 로 잴 것이 없다). */
  const cableMetaFields = cableFieldsFor(FIBER_TRUNK_MEDIUM);
  const portMetaFields = portFieldsFor(FIBER_TRUNK_MEDIUM);
  const metaFields = [...cableMetaFields, ...portMetaFields];
  const totalCols = 1 + groups.length + 1 + metaFields.length;

  /* 코어 번호는 한두 자리라 좁게, 값 열도 좁게 — 남는 폭은 대국 그룹이 나눠 갖는다.
     대국 이름은 '통신랙 A · OFD-1 · 슬롯 1 · 포트 3' 처럼 길어질 수 있어 여기가 넓어야 한다. */
  const META_WIDTH = 11;
  const metaTotal = META_WIDTH * metaFields.length;
  /* 대국 열은 두 홉을 건너간 이름이라 가장 길다 — 성단 열과 같은 몫을 준다. */
  const peerCols = groups.length + 1;
  const fiberWidths = [
    5,
    ...Array.from({ length: peerCols }, () => (100 - 5 - metaTotal) / peerCols),
    ...metaFields.map(() => META_WIDTH),
  ];

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
              {groups.map((g, i) => (
                <Th key={g}>{groupLabels[i] ?? g}</Th>
              ))}
              <Th>대국</Th>
              {metaFields.map((f) => (
                <Th key={f.key}>{f.unit ? `${f.label}(${f.unit})` : f.label}</Th>
              ))}
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
                {/* 슬롯 구분 머리행 — 심 행보다 낮으면 구분자가 오히려 눌려 보인다.
                    같은 높이로 두고 색과 굵기로만 구분한다. */}
                <tr className="h-9 border-b border-line bg-surface-2">
                  <td colSpan={totalCols} className="px-3 text-xs font-medium text-content-muted">
                    {slotName}
                  </td>
                </tr>
                {/* 코어 데이터 행 */}
                {slotRows.map((row) => (
                  <tr
                    key={`${row.slotId}-${row.coreIndex}`}
                    className={cn(
                      'h-9 border-b border-line',
                      SELECTABLE,
                      selectedAssetId === row.slotId && SELECTED,
                    )}
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
                    {/* 인입 건너편에서 이 심선이 닿는 곳 — 예전에는 대국 슬롯에서 끊겼다. */}
                    <td className="px-3 py-1.5">
                      <PeerCell peer={row.farEnd} />
                    </td>
                    {/* 선로측 케이블에 적는 값 — 어떤 칸이 있는지는 종류 선언이 정한다. */}
                    {cableMetaFields.map((f) => (
                      <td key={f.key} className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                        <MetaInput value={row.meta.cableValues[f.key]} field={f} cableId={row.meta.cableId} />
                      </td>
                    ))}
                    {portMetaFields.map((f) => (
                      <td key={f.key} className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                        <PortFieldInput
                          value={row.meta.portValues[f.key]}
                          field={f}
                          portId={row.meta.portId}
                          assetId={row.meta.portAssetId}
                          position={row.coreIndex}
                        />
                      </td>
                    ))}
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
