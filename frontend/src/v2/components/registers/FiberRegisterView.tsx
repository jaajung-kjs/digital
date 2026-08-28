/**
 * FiberRegisterView — 선번장 뷰
 *
 * 상단: 설비(OPGW 포트를 가진 장비를 담은 것) Select
 * 테이블: 슬롯 그룹헤더 행 + 코어별 데이터 행
 *   컬럼: 코어 | {groups 동적} | 길이(m) | 손실(dB) | 점검일
 * 메타 인라인 편집: blur/Enter, 무변경 가드
 */
import { useMemo, useState } from 'react';
import { Th, cn, selectableRow, SELECTABLE, SELECTED, EMPTY, TABLE_ROW, Td} from '../../../components/ui';
import { RegisterLayout } from './RegisterLayout';
import { useEffectiveAssets, useEffectiveCables } from '../../store/useWorkingCopy';
import { useV2WorkingCopy } from '../../store/workingCopyStore';
import { DEFAULT_CORE_COUNT, cableFieldsFor, portFieldsFor, portValuesAt, setPortValueAt, stampKeyFor, type ValueDef } from '@twin/core';
import { useV2Catalog } from '../../hooks';
import { useMediumContainer } from '../../useMediumContainer';
import { fiberContainers, buildFiberRows, FIBER_MEDIUM } from '../../fiberSelectors';
import type { FiberRow } from '../../fiberSelectors';
import { PeerCell } from './PeerCell';
import { InlineEditCell } from '../InlineEditCell';

interface Props {
  substationId: string;
  selectedAssetId: string | null;
  /** 지금 고른 포트 — 주소가 쥔다(`?port=`). 판에서 골라도 이 값이 바뀌어 표가 따라 칠해진다. */
  selectedPortId: string | null;
  /** 드롭다운으로 고른 설비 — 주소가 쥔다(`useWorkspaceRoute`). */
  containerId: string | null;
  onPickContainer: (id: string) => void;
  /** 포트까지 주면 상세 패널이 포트 탭을 열고 그 포트를 고른 상태로 뜬다. */
  onSelectAsset: (id: string | null, portId?: string | null) => void;
}

/** 오늘 — 찍히는 날짜의 형식은 적히는 날짜와 같다(YYYY-MM-DD). */
const today = () => new Date().toISOString().slice(0, 10);

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

  /* 칸의 자료형 그대로 — 예전에는 수가 아니면 전부 날짜였다(선로명 칸에 `YYYY-MM-DD` 가 떴다). */
  return (
    <InlineEditCell
      value={displayValue}
      onCommit={handleCommit}
      type={field.type === 'boolean' ? 'text' : field.type}
      label={field.label}
      unit={field.unit}
      /* 고를 수 있는 값이 선언돼 있으면 목록으로 — 화면이 그 목록을 알지 않는다. */
      options={field.options}
    />
  );
}

/**
 * 슬롯 머리에 적히는 인입 케이블의 값 — 길이와, **그 종류가 선언했다면** 선로 대장 값.
 *
 * 도면과 연결이 아는 것은 여기 없다(대국·용도·경로는 이미 다른 데서 나온다). 밖에서 받아
 * 적는 수밖에 없는 것만 남는다 — 그래서 칸이 적고, 그 적은 칸도 종류가 켤 때만 선다.
 */
function SlotMeta({ cableId, values }: { cableId: string | null; values: Record<string, unknown> }) {
  const catalog = useV2Catalog();
  /* 고르는 것은 **글자 하나**여야 한다 — 객체를 고르면 렌더마다 새 것이 나와 무한히 다시
     그린다(실제로 그 화면이 통째로 죽었다). 필요한 것은 종류 id 뿐이다. */
  const categoryId = useV2WorkingCopy((s) =>
    cableId ? (s.effectiveCables().find((c) => c.id === cableId)?.categoryId ?? null) : null,
  );
  const category = catalog.data?.cableGroups.flatMap((g) => g.categories).find((c) => c.id === categoryId);
  const fields = cableFieldsFor(FIBER_MEDIUM, { managesFiberLine: category?.managesFiberLine });

  /* 값을 담는 자리는 **인입 케이블**이다 — 아직 없으면 적을 곳이 없다는 것을 말해 준다
     (빈 자리로 두면 「왜 이 슬롯만 칸이 없나」가 된다). */
  if (!cableId) return <span className="text-xs text-content-faint">인입 케이블 없음</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-muted">
      {fields.map((f) => (
        <span key={f.key} className="flex items-center gap-1">
          {f.label}
          <span className="min-w-16 text-content">
            <MetaInput value={values[f.key]} field={f} cableId={cableId} />
          </span>
        </span>
      ))}
    </span>
  );
}

// ── 심선 값 인라인 편집 ───────────────────────────────────────────────────────
/**
 * 손실·점검일처럼 **심선마다 다른** 값은 케이블이 아니라 포트에 담긴다.
 *
 * 예전에는 케이블에 담았는데, 그러려면 OPGW 한 가닥을 심선 수만큼 케이블로 복제해야 했고
 * 그 탓에 산출 내역 공량이 그 배로 부풀었다(40m 4심 → 160m). 그리고 아직 이어지지 않은 심선에는
 * 케이블이 없어 성단 손실을 적을 곳조차 없었다.
 *
 * 포트는 장비 품목 명세가 만드는 것이라 생성·삭제가 없고 값만 바뀐다 — 그래서 자산 패치에 얹는다
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
    const ports = asset.ports.map((p) => {
      if (p.id !== resolvedPortId) return p;
      let fieldValues = setPortValueAt(p, position, field.key, next);
      /* **언제 쟀는가는 찍히는 것이다** — 값을 고치면 그날이 된다. 사람이 따로 적게 두면
         값과 날짜가 어긋난다(고치고 날짜는 안 고친다). 어느 칸에 찍을지는 종류가 말한다. */
      const stampKey = stampKeyFor(p.medium);
      if (stampKey && stampKey !== field.key) {
        fieldValues = setPortValueAt({ ...p, fieldValues }, position, stampKey, today());
      }
      return { ...p, fieldValues };
    });
    useV2WorkingCopy.getState().stageAssetUpdate(resolvedAssetId, { ports });
  }

  /* 따라오는 칸은 **읽는 줄**이다 — 적게 두면 값과 어긋난다. */
  /* 날짜는 **한 줄로** 선다 — 좁으면 `2026-08-` / `27` 로 접혀 두 줄이 된다(줄 키가 들쭉날쭉해진다). */
  if (field.readOnly) return <span className="whitespace-nowrap text-content-muted">{shown || EMPTY}</span>;
  return (
    <InlineEditCell
      value={shown}
      onCommit={handleCommit}
      type={isNumber ? 'number' : 'date'}
      label={field.label}
      unit={field.unit}
      /* 고를 수 있는 값이 선언돼 있으면 목록으로 — 화면이 그 목록을 알지 않는다. */
      options={field.options}
    />
  );
}

// PeerCell은 공용 컴포넌트로 추출 (M-2 — PowerRegisterView와 공유)

// ── 메인 뷰 ──────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function FiberRegisterView({
  substationId: _substationId,
  selectedAssetId,
  selectedPortId,
  containerId,
  onPickContainer,
  onSelectAsset,
}: Props) {
  const effectiveAssets = useEffectiveAssets();
  const effectiveCables = useEffectiveCables();

  const containers = useMemo(() => fiberContainers(effectiveAssets), [effectiveAssets]);

  const [query, setQuery] = useState('');
  /**
   * 고른 심선 — **주소가 쥔 포트**에서 나온다. 여기서 따로 들고 있지 않는다.
   *
   * 표의 단위는 자산이 아니라 심선이다(자산 id 로 칠하면 그 슬롯의 24행이 한꺼번에 물든다).
   * 심선 한 줄은 포트 하나로 가리킬 수 있다 — 장비쪽 성단이 있으면 그 포트, 아직 성단되지
   * 않았으면 그 심선을 나르는 인입 포트. 판에서 그 포트를 골라도 같은 줄이 칠해진다.
   */
  const portOf = (row: FiberRow) => row.cells.find((c) => c.portId)?.portId ?? row.meta.portId;
  const isSelected = (row: FiberRow) => selectedPortId != null && portOf(row) === selectedPortId;

  /**
   * 이 줄은 심선 하나다 — 패널도 그 포트를 고른 상태로 열어 준다.
   *
   * 줄에 대응하는 포트는 그 코어의 장비쪽 성단이고, 아직 성단되지 않은 코어(12구 판의
   * 13번 같은)는 그 심선을 나르는 인입 포트로 물러선다.
   */
  const selectCore = (row: FiberRow, next: string | null) => {
    if (next === null) {
      onSelectAsset(null);
      return;
    }
    onSelectAsset(row.slotId, portOf(row));
  };

  /* 표의 단위는 설비 하나 — 계통과 같은 훅을 쓴다. */
  const picked = useMediumContainer(containers, {
    assets: effectiveAssets,
    selectedAssetId,
    containerId,
    onPickContainer,
  });

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
  /* 케이블의 값은 **열이 아니라 묶음 머리**에 적는다 — 한 슬롯의 스물네 줄이 같은 케이블을
     가리키므로, 열로 세우면 같은 글자가 스물네 번 선다. 어떤 칸이 있는지는 그 케이블의
     **종류 선언**이 정한다(광 선로면 관리번호·선로명·접속개소가 더 붙는다). */
  const portMetaFields = portFieldsFor(FIBER_MEDIUM, DEFAULT_CORE_COUNT);
  /* 값 칸의 **줄맞춤은 열이 정한다** — 수는 오른쪽, 글자는 왼쪽(계통 표와 같은 규칙).
     칸이 저마다 정하면 같은 열에서 적힌 값과 대시가 서로 다른 자리에 선다. */
  const alignOf = (f: ValueDef) => (f.type === 'number' ? 'right' as const : 'left' as const);
  const metaFields = portMetaFields;
  const totalCols = 1 + groups.length + 1 + metaFields.length;

  /* 코어 번호는 한두 자리지만 **머리글이 접히지 않을 만큼**은 있어야 한다 — 5% 로 뒀더니
     `코어` 두 글자가 두 줄로 갈라져 머리글 줄만 키가 커졌다.
     값 열은 무엇을 적는 칸인지에 따라 다르다: 날짜 칸에는 달력 아이콘이 함께 들어가므로
     숫자 칸과 같은 폭을 주면 아이콘이 날짜 위에 겹친다. */
  /* 「코어」 두 글자가 한 줄로 서고 **왼쪽 여백은 남는** 만큼 — 오른쪽 여백만 좁혔다.
     (좌우 12px 인 채로 5% 였을 때는 머리글이 「코0」으로 잘렸다.) */
  const CORE_WIDTH = 6;
  /* 수 칸은 **여섯 자리까지** 들어갈 만큼 준다(길이 m) — 10% 로 뒀더니 네 자리에서 이미
     끝자리가 잘렸다. 그 몫은 **날짜 칸**에서 떼어 온다: 값은 이제 읽는 줄로 서고 상자는
     고칠 때만 뜨므로(`InlineEditCell`) 달력 아이콘이 늘 자리를 잡고 있을 이유가 없다.
     대국 열은 두 자리 번호(`…광단말 A#12`)에서 실측 161px 가 필요하다 — 25% 로 둔다. */
  /* 값 칸은 모두 같은 몫이다 — 단위가 아랫줄로 내려가 머리글 길이가 값 길이와 비슷해졌고,
     날짜도 이제 **읽는 줄**이라(측정일은 찍힌다) 상자와 달력 아이콘 자리가 필요 없다. */
  /* 날짜 칸만 한 뼘 넓다 — `2026-08-27` 열 글자가 접히지 않을 만큼(나머지는 서너 자리 수다). */
  const metaWidth = (f: ValueDef) => (f.type === 'date' ? 13 : 11);
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
        title: '선번장에 표시할 광 설비가 없습니다',
        /* 설명은 **무엇을 하면 나타나는가** 한 줄이다 — 왜 그런지는 여기서 설명하지 않는다. */
        description: '경로슬롯을 담은 설비 품목(OFD 등)를 평면도에 놓으면 나타납니다.',
      }}
      search={{
        'aria-label': '심 검색',
        placeholder: '슬롯 · 대국 설비 · 포트 검색',
        value: query,
        onChange: setQuery,
        shown: filteredRows.length,
        total: rows.length,
      }}
      onClearSelection={() => onSelectAsset(null)}
      widths={fiberWidths}
      head={
        <>
          {/* 코어 칸은 **오른쪽 여백만** 좁힌다. 한두 자리 수에 12px 여백이 양쪽으로 붙으면
              그 몫이 이름 칸에서 빠지지만, 왼쪽은 표의 가장자리라 그대로 둔다 — 거기까지
              좁히면 글자가 테두리에 붙어 답답해 보인다. */}
          <Th className="pl-3 pr-1">코어</Th>
          {/* 두 이름은 **짝**이다 — 이 코어가 우리 국에서 무엇에 물렸나 / 선로를 타고 어디로
              가나. 예전에는 왼쪽이 「광 포트」(포트 그룹 이름)여서 오른쪽 「대국」과 견줄 수
              없었다. 앞면 그룹이 둘 이상이면 그때만 어느 판인지 덧붙인다. */}
          {groups.map((g, i) => (
            <Th key={g}>{groups.length > 1 ? `자국 연결 · ${groupLabels[i] ?? g}` : '자국 연결'}</Th>
          ))}
          <Th>대국 연결</Th>
          {metaFields.map((f) => (
            /* 단위는 머리글이 아니라 **값 뒤에** 붙는다(`-13 dB`) — 단위는 값의 성질이지
               열 이름의 일부가 아니고, 이름에 달면 그만큼 길어져 잘린다. */
            <Th key={f.key} align={alignOf(f)}>{f.label}</Th>
          ))}
        </>
      }
      sections={
        rowGroups.length === 0
          ? undefined
          : rowGroups.map(({ slotId, slotName, rows: slotRows }) => ({
              key: slotId,
              title: slotName,
              /* 인입 케이블의 값 — **묶음 머리에 한 번**. 어떤 칸이 있는지는 그 케이블의
                 종류가 선언한다(광 선로면 관리번호·선로명·접속개소가 더 붙는다). */
              meta: <SlotMeta cableId={slotRows[0]?.meta.cableId ?? null} values={slotRows[0]?.meta.cableValues ?? {}} />,
              rows: slotRows.map((row) => (
              <tr
                key={`${row.slotId}-${row.coreIndex}`}
                {...selectableRow(isSelected(row) ? portOf(row) : null, portOf(row) ?? row.slotId, (next) => selectCore(row, next))}
                className={cn(
                  TABLE_ROW,
                  SELECTABLE,
                  isSelected(row) && SELECTED,
                )}
              >
                {/* 코어 번호 */}
                <Td className="py-1.5 pl-3 pr-1 text-sm text-content-muted">{row.coreIndex}</Td>
                {/* 그룹별 피어 셀 */}
                {row.cells.map((cell) => (
                  <Td key={cell.group}>
                    <PeerCell peer={cell.peer} />
                  </Td>
                ))}
                {/* 인입 건너편에서 이 심선이 닿는 곳 — 예전에는 대국 슬롯에서 끊겼다. */}
                <Td>
                  <PeerCell peer={row.farEnd} />
                </Td>
                {portMetaFields.map((f) => (
                  <Td key={f.key} align={alignOf(f)}>
                    <PortFieldInput
                      value={row.meta.portValues[f.key]}
                      field={f}
                      portId={row.meta.portId}
                      assetId={row.meta.portAssetId}
                      position={row.coreIndex}
                    />
                  </Td>
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
        <Td colSpan={totalCols} className="px-3 py-6 text-center text-sm text-content-faint">
          {query.trim() ? `'${query.trim()}' 와 맞는 심이 없습니다` : '슬롯 데이터가 없습니다'}
        </Td>
      </tr>
    </RegisterLayout>
  );
}
