/**
 * PowerRegisterView — 계통 뷰
 *
 * 상단: 설비(전원 포트를 가진 장비를 담은 것) Select
 * 테이블 컬럼: 회로 | 피더 | 상태 | 전원 입력(peer) | 전압 | 부하 출력(peer)
 *   - 개폐: 출력 포트의 `closed` 값을 여닫는 스위치
 *   - 전압: 인라인 Input → stageCableUpdate specParams 병합 (IN 케이블 없으면 EMPTY)
 *   - peer: 선번장과 동일(원격 Badge)
 *   - 행 클릭 → onSelectAsset(feederId)
 */
import { useMemo, useState } from 'react';
import { Th, Toggle, cn, SELECTABLE, SELECTED, EMPTY, selectableRow } from '../../../components/ui';
import { RegisterLayout } from './RegisterLayout';
import { useEffectiveAssets, useEffectiveCables } from '../../store/useWorkingCopy';
import { useV2WorkingCopy } from '../../store/workingCopyStore';
import { powerContainers, buildPowerRows, POWER_MEDIUM } from '../../powerSelectors';
import { cableFieldsFor, portFieldsFor, setPortValueAt, type ValueDef } from '@twin/core';
import type { PowerRow, PowerCell } from '../../powerSelectors';
import { useMediumContainer } from '../../useMediumContainer';
import { PeerCell } from './PeerCell';
import { InlineEditCell } from '../InlineEditCell';

interface Props {
  substationId: string;
  selectedAssetId: string | null;
  /** 드롭다운으로 고른 설비 — 주소가 쥔다(`useWorkspaceRoute`). */
  containerId: string | null;
  onPickContainer: (id: string) => void;
  onSelectAsset: (id: string | null) => void;
}

// PeerCell은 공용 컴포넌트 사용 (M-2 — FiberRegisterView와 공유)

/**
 * 개폐 — 값은 **출력 포트**에 담긴다(자산 필드가 아니다).
 *
 * 회로가 없는 빈 자리에는 적을 곳이 없으므로 대시. 저장 형상을 아는 곳은
 * `setPortValueAt` 하나뿐이고, **어떤 키에 적는지는 종류 선언이 정한다** —
 * 한때 여기만 `'closed'` 를 직접 적고 있어서 읽기는 선언 기반인데 쓰기만 키를 알았다.
 */
function ClosedCell({ feederId, portId, closed }: { feederId: string; portId: string | null; closed: boolean | null }) {
  /* 개폐는 **출력 포트에 적힌 값**이다 — 그 포트가 없는 기기(광단말처럼 받기만 하는 것)는
     켜고 끌 것이 없다. 예전에는 대시만 서서, 같은 열에 토글과 대시가 섞인 이유가 화면에
     없었다("왜 저건 안 눌리지"). 대시가 스스로 그 까닭을 들고 있게 한다. */
  if (!portId) {
    return (
      <span className="text-content-faint" title="출력 포트가 없어 개폐할 수 없습니다" aria-label="개폐 없음">
        {EMPTY}
      </span>
    );
  }
  const resolvedPortId: string = portId;

  function toggle(next: boolean) {
    const asset = useV2WorkingCopy.getState().effectiveAssets().find((a) => a.id === feederId);
    const port = asset?.ports.find((p) => p.id === resolvedPortId);
    if (!asset || !port) return;
    const field = portFieldsFor(port.medium).find((f) => f.type === 'boolean');
    if (!field) return;
    const ports = asset.ports.map((p) =>
      p.id === resolvedPortId ? { ...p, fieldValues: setPortValueAt(p, 1, field.key, next) } : p,
    );
    useV2WorkingCopy.getState().stageAssetUpdate(feederId, { ports });
  }

  return (
    <Toggle
      checked={closed === true}
      onChange={toggle}
      size="sm"
      label={closed === true ? 'ON' : 'OFF'}
      aria-label="개폐"
    />
  );
}

// ── 케이블 값 인라인 편집 (케이블 없으면 EMPTY 비편집) ────────────────────────
interface CableFieldInputProps {
  cableId: string | null;
  value: unknown;
  /** 어떤 값을 적는 칸인지 — 키·자료형이 여기서 나온다. 화면이 키를 알지 않는다. */
  field: ValueDef;
}

function CableFieldInput({ cableId, value, field }: CableFieldInputProps) {
  if (!cableId) return <span className="text-content-faint">{EMPTY}</span>;

  const resolvedCableId: string = cableId;
  const isNumber = field.type === 'number';

  function handleCommit(raw: string) {
    const effectiveCables = useV2WorkingCopy.getState().effectiveCables();
    const cable = effectiveCables.find((c) => c.id === resolvedCableId);
    if (!cable) return;

    const existingParams = cable.specParams ?? {};
    const next = isNumber ? (raw.trim() === '' ? null : Number(raw)) : (raw.trim() || null);
    if (isNumber && typeof next === 'number' && Number.isNaN(next)) return;
    const current = existingParams[field.key] ?? null;
    if (current === next) return;

    useV2WorkingCopy.getState().stageCableUpdate(resolvedCableId, {
      specParams: { ...existingParams, [field.key]: next },
    });
  }

  const shown = value === null || value === undefined ? '' : String(value);
  return (
    <InlineEditCell
      value={shown}
      onCommit={handleCommit}
      type={isNumber ? 'number' : field.type === 'date' ? 'date' : undefined}
      label={field.label}
      unit={field.unit}
    />
  );
}

// ── 메인 뷰 ──────────────────────────────────────────────────────────────────
export function PowerRegisterView({
  substationId: _substationId,
  selectedAssetId,
  containerId,
  onPickContainer,
  onSelectAsset,
}: Props) {
  const effectiveAssets = useEffectiveAssets();
  const effectiveCables = useEffectiveCables();

  const containers = useMemo(() => powerContainers(effectiveAssets), [effectiveAssets]);

  /* 어느 설비를 보고 있나 + 그 설비 품목이 선언한 회로 수.
     회로 수가 선언돼 있으면 빈 자리까지 표(패널 스케줄)에 나오고, 자유형이면 있는 것만 나온다.
     "몇 회로짜리인가" 는 타입이 아니라 명세가 말한다 — 코드는 분전반을 모르지 않는다. */
  /* 케이블에 적는 값 — 몇 칸인지는 종류 선언이 정한다(예전에는 전압 하나로 박혀 있었다). */
  const cableFields = cableFieldsFor(POWER_MEDIUM);
  /* 회로 · 피더 · 상태 · 전원 입력 + 값 칸들 + 부하 출력.
     예전에 「전원 입력」을 빼먹어 하나 적게 셌다 — 그래서 빈 자리 행이 마지막 열을 덮지
     못했고, 그 행에 커서를 올리면 **호버 색이 오른쪽에서 잘렸다**(칠할 칸이 없으니까). */
  const totalCols = 5 + cableFields.length;
  const FIELD_WIDTH = 10;
  const powerWidths = [
    8, // 회로
    24, // 피더
    12, // 상태
    100 - 8 - 24 - 12 - 22 - FIELD_WIDTH * cableFields.length, // 전원 입력 — 남는 폭
    ...cableFields.map(() => FIELD_WIDTH),
    22, // 부하 출력
  ];

  const picked = useMediumContainer(containers, {
    assets: effectiveAssets,
    selectedAssetId,
    containerId,
    onPickContainer,
  });
  const activeContainer = picked.active;

  /* 빈 회로 자리를 누르면 그 자리에 자산을 넣는다 — 모달은 이 뷰가 소유한다
     (평면도가 배치 모달을 직접 다루는 것과 같은 규칙). */
  /** 「+ 추가」를 누른 빈 자리 — 격자 칸이다(번호가 아니라). */

  const rows = useMemo<PowerRow[]>(() => {
    if (!activeContainer) return [];
    return buildPowerRows(activeContainer, effectiveAssets, effectiveCables);
  }, [activeContainer, effectiveAssets, effectiveCables]);

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
    return rows.filter((r) =>
      [r.feederName, peerText(r.inCell), peerText(r.outCell)].some((v) => v.toLowerCase().includes(q)),
    );
  }, [rows, query]);

  return (
    <RegisterLayout
      picker={picked}
      empty={{
        title: '계통에 표시할 전원 설비가 없습니다',
        description: '분전반 등 전원 설비를 평면도에 놓고 그 안에 피더를 넣으면 나타납니다.',
      }}
      search={{
        'aria-label': '회로 검색',
        placeholder: '피더 · 연결 설비 검색',
        value: query,
        onChange: setQuery,
        shown: filtered.length,
        total: rows.length,
      }}
      onClearSelection={() => onSelectAsset(null)}
      widths={powerWidths}
      head={
        <>
          <Th>회로</Th>
          <Th>피더</Th>
          <Th>상태</Th>
          <Th>전원 입력</Th>
          {/* 케이블에 적는 값은 각자 제 열을 갖는다 — 대국 아래에 끼워 넣으니 그 행만
              두 줄이 되어 표의 행 높이가 43~63px 로 들쭉날쭉했다.
              몇 칸인지는 종류 선언이 정한다. */}
          {cableFields.map((f) => (
            /* 단위는 머리글이 아니라 **값 뒤에** 붙는다 — 선번장과 같은 규칙(`InlineEditCell unit`). */
            <Th key={f.key}>{f.label}</Th>
          ))}
          <Th>부하 출력</Th>
        </>
      }
      note={
        /* 값 열이 **통째로** 비었을 때만 왜 비었는지 말한다.
           전원 입력·길이·전압·부하 출력은 모두 이 회로에 물린 케이블에서 나오므로, 케이블이
           하나도 없으면 넷이 다 대시로 서서 「고장인가 안 이은 건가」를 구별할 수 없다.
           한 줄이라도 값이 있으면 적지 않는다 — 그때는 대시가 스스로 「이 줄만 없다」는 뜻이다. */
        filtered.length > 0 && filtered.every((r) => !r.inCell.cableId && !r.outCell.peer) ? (
          <p className="px-1 pt-2 text-xs text-content-faint">
            전원 입력 · 부하 출력은 <strong className="font-medium">케이블을 이어야</strong> 채워집니다.
          </p>
        ) : null
      }
    >
        {filtered.length === 0 && (
          <tr>
            <td colSpan={totalCols} className="px-3 py-6 text-center text-sm text-content-faint">
              {query.trim() ? `'${query.trim()}' 와 맞는 회로가 없습니다` : '피더 데이터가 없습니다'}
            </td>
          </tr>
        )}
        {filtered.map((row) => (
          <tr
            key={row.feederId}
            {...selectableRow(selectedAssetId, row.feederId, onSelectAsset)}
            /* 모든 행이 같은 높이 — 패널 스케줄은 눈으로 회로를 세는 표다. 빈 자리 행에는
               컨트롤이 없어 10px 낮았고, 그 바람에 번호 간격이 들쭉날쭉했다. */
            className={cn(
              'h-11 border-b border-line focus-visible:outline-none focus-ring-input',
              SELECTABLE,
              selectedAssetId === row.feederId && SELECTED,
            )}
          >
            <td className="px-3 py-1.5 text-sm text-content-muted tabular-nums">{row.slotNo ?? EMPTY}</td>
            <td className="truncate px-3 py-1.5 text-sm text-content">{row.feederName}</td>

            {/* 개폐 — 그 회로의 상태이지 기기의 속성이 아니다. 값은 출력 포트에 있다. */}
            <td className="px-3 py-1.5">
              <ClosedCell feederId={row.feederId} portId={row.outCell.portId} closed={row.closed} />
            </td>

            <td className="truncate px-3 py-1.5">
              <PeerCell peer={row.inCell.peer} />
            </td>

            {cableFields.map((f) => (
              <td key={f.key} className="px-3 py-1.5">
                <CableFieldInput cableId={row.inCell.cableId} value={row.inCell.values[f.key]} field={f} />
              </td>
            ))}

            <td className="truncate px-3 py-1.5">
              <PeerCell peer={row.outCell.peer} />
            </td>
          </tr>
        ))}
    </RegisterLayout>
  );
}
