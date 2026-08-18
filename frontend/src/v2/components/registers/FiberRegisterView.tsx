/**
 * FiberRegisterView — 선번장 뷰
 *
 * 상단: 설비(OPGW 포트를 가진 부품을 담은 것) Select
 * 테이블: 슬롯 그룹헤더 행 + 코어별 데이터 행
 *   컬럼: 코어 | {groups 동적} | 길이(m) | 손실(dB) | 점검일
 * 메타 인라인 편집: blur/Enter, 무변경 가드
 */
import { useEffect, useMemo, useState } from 'react';
import { Th, cn, selectableRow, SELECTABLE, SELECTED, EMPTY } from '../../../components/ui';
import { RegisterLayout } from './RegisterLayout';
import { mergeEffective } from '../../store/overlay';
import { useV2WorkingCopy } from '../../store/workingCopyStore';
import { DEFAULT_CORE_COUNT, cableFieldsFor, portFieldsFor, portValuesAt, setPortValueAt, type ValueDef } from '@twin/core';
import { useMediumContainer } from '../../useMediumContainer';
import { fiberContainers, buildFiberRows, FIBER_MEDIUM } from '../../fiberSelectors';
import type { FiberRow } from '../../fiberSelectors';
import { PeerCell } from './PeerCell';
import { InlineEditCell } from '../InlineEditCell';

interface Props {
  substationId: string;
  selectedAssetId: string | null;
  /** 드롭다운으로 고른 설비 — 주소가 쥔다(`useWorkspaceRoute`). */
  containerId: string | null;
  onPickContainer: (id: string) => void;
  /** 포트까지 주면 상세 패널이 포트 탭을 열고 그 포트를 고른 상태로 뜬다. */
  onSelectAsset: (id: string | null, portId?: string | null) => void;
}

// ── 메타 셀 인라인 편집 ───────────────────────────────────────────────────────
interface MetaInputProps {
  value: unknown;
  /** 어떤 값을 적는 칸인지 — 키·자료형이 여기서 나온다. 화면이 키를 알지 않는다. */
  field: ValueDef;
  cableId: string | null;
}

function MetaInput({ value, field, cableId }: MetaInputProps) {
  const { key: fieldKey, type } = field;
  // cableId 없으면 비편집 대시
  if (!cableId) return <span className="text-content-faint">{EMPTY}</span>;

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
 * 포트는 자산 종류 명세가 만드는 것이라 생성·삭제가 없고 값만 바뀐다 — 그래서 자산 패치에 얹는다
 * (별도 OCC 축을 만들지 않는다).
 */
function PortFieldInput({
  value, field, portId, assetId, position,
}: { value: unknown; field: ValueDef; portId: string | null; assetId: string | null; position: number }) {
  if (!portId || !assetId) return <span className="text-content-faint">{EMPTY}</span>;
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
export function FiberRegisterView({
  substationId: _substationId,
  selectedAssetId,
  containerId,
  onPickContainer,
  onSelectAsset,
}: Props) {
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

  const [query, setQuery] = useState('');
  /* 고른 심선 — 표의 단위는 자산이 아니라 **심선**이다. 자산 id 로 칠하면 그 슬롯의 24행이
     한꺼번에 물들어, 어느 심선을 눌렀는지가 화면에서 사라진다(실제로 그랬다). */
  /** 고른 심선 — 슬롯과 코어를 합친 한 글자열. 표의 행 열쇠와 같은 것이라 규칙이 하나다. */
  const [selectedCore, setSelectedCore] = useState<string | null>(null);
  const coreKey = (row: FiberRow) => `${row.slotId}-${row.coreIndex}`;

  /**
   * 이 줄은 심선 하나다 — 패널도 그 포트를 고른 상태로 열어 준다.
   *
   * 줄에 대응하는 포트는 그 코어의 장비쪽 성단이고, 아직 성단되지 않은 코어(12구 판의
   * 13번 같은)는 그 심선을 나르는 인입 포트로 물러선다.
   */
  const selectCore = (row: FiberRow, next: string | null) => {
    setSelectedCore(next);
    if (next === null) {
      onSelectAsset(null);
      return;
    }
    const corePortId = row.cells.find((c) => c.portId)?.portId ?? null;
    onSelectAsset(row.slotId, corePortId ?? row.meta.portId);
  };

  /* 표의 단위는 설비 하나 — 계통과 같은 훅을 쓴다. */
  const picked = useMediumContainer(containers, {
    assets: effectiveAssets,
    selectedAssetId,
    containerId,
    onPickContainer,
  });

  /* 패널이 다른 자산으로 옮겨 가면 표의 선택도 놓는다 — 둘이 서로 다른 것을 가리키면
     "선택" 이라는 말이 화면에서 두 가지 뜻이 된다. */
  useEffect(() => {
    setSelectedCore((cur) => (cur && selectedAssetId != null && cur.startsWith(`${selectedAssetId}-`) ? cur : null));
  }, [selectedAssetId]);
  const activeContainer = picked.active;

  const { groups, groupLabels, rows } = useMemo(() => {
    if (!activeContainer) return { groups: [] as string[], groupLabels: [] as string[], rows: [] as FiberRow[] };
    return buildFiberRows(activeContainer, effectiveAssets, effectiveCables);
  }, [activeContainer, effectiveAssets, effectiveCables]);

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
  const cableMetaFields = cableFieldsFor(FIBER_MEDIUM);
  // 코어별 값(손실·점검일)은 **다심** 포트에만 선언돼 있다 — 심선 수를 함께 묻는다.
  const portMetaFields = portFieldsFor(FIBER_MEDIUM, DEFAULT_CORE_COUNT);
  const metaFields = [...cableMetaFields, ...portMetaFields];
  const totalCols = 1 + groups.length + 1 + metaFields.length;

  /* 코어 번호는 한두 자리지만 **머리글이 접히지 않을 만큼**은 있어야 한다 — 5% 로 뒀더니
     `코어` 두 글자가 두 줄로 갈라져 머리글 줄만 키가 커졌다.
     값 열은 무엇을 적는 칸인지에 따라 다르다: 날짜 칸에는 달력 아이콘이 함께 들어가므로
     숫자 칸과 같은 폭을 주면 아이콘이 날짜 위에 겹친다. */
  const CORE_WIDTH = 8;
  const metaWidth = (f: ValueDef) => (f.type === 'date' ? 20 : 10);
  const metaTotal = metaFields.reduce((sum, f) => sum + metaWidth(f), 0);
  /* 대국 열은 두 홉을 건너간 이름이라 가장 길다 — 성단 열과 같은 몫을 준다. */
  const peerCols = groups.length + 1;
  const fiberWidths = [
    CORE_WIDTH,
    ...Array.from({ length: peerCols }, () => (100 - CORE_WIDTH - metaTotal) / peerCols),
    ...metaFields.map(metaWidth),
  ];

  return (
    <RegisterLayout
      picker={picked}
      empty={{
        title: '선번장에 표시할 광 자산이 없습니다',
        /* 설명은 **무엇을 하면 나타나는가** 한 줄이다 — 왜 그런지는 여기서 설명하지 않는다. */
        description: '경로슬롯을 담은 설비 종류(OFD 등)를 평면도에 놓으면 나타납니다.',
      }}
      search={{
        'aria-label': '심 검색',
        placeholder: '슬롯 · 대국 자산 · 포트 검색',
        value: query,
        onChange: setQuery,
        shown: filteredRows.length,
        total: rows.length,
      }}
      onClearSelection={() => {
        setSelectedCore(null);
        onSelectAsset(null);
      }}
      widths={fiberWidths}
      head={
        <>
          <Th>코어</Th>
          {groups.map((g, i) => (
            <Th key={g}>{groupLabels[i] ?? g}</Th>
          ))}
          <Th>대국</Th>
          {metaFields.map((f) => (
            <Th key={f.key}>{f.unit ? `${f.label}(${f.unit})` : f.label}</Th>
          ))}
        </>
      }
      sections={
        rowGroups.length === 0
          ? undefined
          : rowGroups.map(({ slotId, slotName, rows: slotRows }) => ({
              key: slotId,
              title: slotName,
              rows: slotRows.map((row) => (
              <tr
                key={`${row.slotId}-${row.coreIndex}`}
                {...selectableRow(selectedCore, coreKey(row), (next) => selectCore(row, next))}
                className={cn(
                  'h-9 border-b border-line focus-visible:outline-none focus-ring-input',
                  SELECTABLE,
                  selectedCore === coreKey(row) && SELECTED,
                )}
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
              )),
            }))
      }
    >
      {/* 슬롯마다 **표가 하나씩** 선다(`sections`) — 표 안에 구분행을 넣지 않는다.
          구분행은 그 줄에서 열 정의를 잃어(colSpan) 아래 행이 무슨 열인지 다시 말해 주지
          못한다. 업계 표준은 묶음마다 제 머리글을 가진 표를 따로 세우는 것이다. */}
      <tr>
        <td colSpan={totalCols} className="px-3 py-6 text-center text-sm text-content-faint">
          {query.trim() ? `'${query.trim()}' 와 맞는 심이 없습니다` : '슬롯 데이터가 없습니다'}
        </td>
      </tr>
    </RegisterLayout>
  );
}
