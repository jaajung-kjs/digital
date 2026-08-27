/**
 * 계통 뷰 — **전원이 어디서 와서 어디로 가나**.
 *
 * 실무 대장이 그렇게 생겼다(분전반 수용내역 · 전원계통도): 반(盤)마다 머리에 「입력 : AC소내
 * 분전반 우 5단자 (60A FR-38sq)」를 적고, 그 아래에 회로를 번호순으로 늘어놓는다 —
 * 번호 · 용량 · 용도 · 전원케이블 · 개폐. 반들은 그 머리줄로 서로 매달려 나무를 이룬다.
 *
 * 그래서 여기서는 **반 하나가 묶음 하나**이고, 회로 한 줄이 **출력 포트 하나**다. 예전에는
 * 「피더 자산 하나 = 한 줄」이라 13구 분배반이 한 줄로 뭉갰고(개폐는 회로마다 따로인데),
 * 위쪽 드롭다운으로 반을 하나씩 골라 봐야 해서 「이 반이 어디에 매달렸나」는 어디에도 없었다.
 */
import { useMemo, useState } from 'react';
import { Th, Toggle, cn, SELECTABLE, SELECTED, EMPTY, selectableRow } from '../../../components/ui';
import { RegisterLayout } from './RegisterLayout';
import { useEffectiveAssets, useEffectiveCables } from '../../store/useWorkingCopy';
import { useV2WorkingCopy } from '../../store/workingCopyStore';
import { powerTree, POWER_MEDIUM } from '../../powerSelectors';
import { cableFieldsFor, portFieldsFor, setPortValueAt, type ValueDef } from '@twin/core';
import type { PowerCircuit, PowerNode } from '../../powerSelectors';
import { PeerCell } from './PeerCell';
import { InlineEditCell } from '../InlineEditCell';

interface Props {
  substationId: string;
  selectedAssetId: string | null;
  onSelectAsset: (id: string | null, portId?: string | null) => void;
}

// PeerCell은 공용 컴포넌트 사용 (M-2 — FiberRegisterView와 공유)

/**
 * 개폐 — 값은 **출력 포트**에 담긴다(자산 필드가 아니다).
 *
 * 회로가 없는 빈 자리에는 적을 곳이 없으므로 대시. 저장 형상을 아는 곳은
 * `setPortValueAt` 하나뿐이고, **어떤 키에 적는지는 종류 선언이 정한다** —
 * 한때 여기만 `'closed'` 를 직접 적고 있어서 읽기는 선언 기반인데 쓰기만 키를 알았다.
 */
function ClosedCell({ assetId, portId, closed }: { assetId: string; portId: string | null; closed: boolean | null }) {
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
    const asset = useV2WorkingCopy.getState().effectiveAssets().find((a) => a.id === assetId);
    const port = asset?.ports.find((p) => p.id === resolvedPortId);
    if (!asset || !port) return;
    const field = portFieldsFor(port.medium).find((f) => f.type === 'boolean');
    if (!field) return;
    const ports = asset.ports.map((p) =>
      p.id === resolvedPortId ? { ...p, fieldValues: setPortValueAt(p, 1, field.key, next) } : p,
    );
    useV2WorkingCopy.getState().stageAssetUpdate(assetId, { ports });
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
/** 나무를 위에서 아래로 편 목록 — 깊이를 함께 들고 간다(들여쓰기로 매달림을 보인다). */
function flatten(nodes: PowerNode[], depth = 0): { node: PowerNode; depth: number }[] {
  return nodes.flatMap((node) => [{ node, depth }, ...flatten(node.children, depth + 1)]);
}

export function PowerRegisterView({ substationId: _substationId, selectedAssetId, onSelectAsset }: Props) {
  const effectiveAssets = useEffectiveAssets();
  const effectiveCables = useEffectiveCables();

  /* 케이블에 적는 값 — 몇 칸인지는 종류 선언이 정한다(전압 등). */
  const cableFields = cableFieldsFor(POWER_MEDIUM);
  /* 회로 · 개폐 · 용도 + 값 칸들. */
  const FIELD_WIDTH = 12;
  const widths = [10, 12, 100 - 10 - 12 - FIELD_WIDTH * cableFields.length, ...cableFields.map(() => FIELD_WIDTH)];

  const tree = useMemo(() => powerTree(effectiveAssets, effectiveCables), [effectiveAssets, effectiveCables]);
  const nodes = useMemo(() => flatten(tree), [tree]);

  /* 회로가 마흔인 국에서 「그 회로」를 찾는 길이 눈으로 훑는 것뿐이면 표가 아니다.
     보이는 값을 통째로 훑는다 — 사람은 이름을 기억하지 그것이 몇 번째 열인지는 모른다. */
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const match = (node: PowerNode, c: PowerCircuit) =>
    q === '' ||
    [c.name, c.load?.assetName, c.load?.assemblyName, node.name, node.containerName]
      .some((v) => (v ?? '').toLowerCase().includes(q));

  const shownNodes = nodes
    .map(({ node, depth }) => ({ node, depth, circuits: node.circuits.filter((c) => match(node, c)) }))
    .filter((n) => n.circuits.length > 0 || q === '');
  const totalCircuits = nodes.reduce((n, { node }) => n + node.circuits.length, 0);
  const shownCircuits = shownNodes.reduce((n, s) => n + s.circuits.length, 0);

  /**
   * 이 반이 어디서 받는가 — 대장의 머리줄(「입력 : AC소내분전반 우 5단자」).
   *
   * **아직 안 이은 것과 밖에서 오는 것은 다르다.** 케이블이 아예 없으면 그린 사람이 아직
   * 안 그린 것이고(할 일), 케이블은 있는데 상대가 이 도면에 없으면 소내 전원처럼 밖에서
   * 오는 것이다(정상). 둘을 같은 말로 적으면 결선이 빠진 국이 다 갖춰진 것처럼 보인다.
   */
  const sourceText = (node: PowerNode) => {
    if (node.sources.length === 0) return '입력 포트 없음';
    return node.sources
      .map((s) => (s.from ? `${s.from.assetName} ${s.from.portName}` : s.cableId ? '이 도면 밖' : '미결선'))
      .join(' · ');
  };

  return (
    <RegisterLayout
      empty={{
        title: '계통에 표시할 전원 설비가 없습니다',
        description: '분전반·UPS·충전기처럼 전원을 나눠 주는 장비를 놓으면 나타납니다.',
      }}
      search={{
        'aria-label': '회로 검색',
        placeholder: '회로 · 부하 · 반 이름 검색',
        value: query,
        onChange: setQuery,
        shown: shownCircuits,
        total: totalCircuits,
      }}
      onClearSelection={() => onSelectAsset(null)}
      widths={widths}
      head={
        <>
          <Th>회로</Th>
          <Th>개폐</Th>
          <Th>용도</Th>
          {/* 단위는 머리글이 아니라 **값 뒤에** 붙는다 — 선번장과 같은 규칙. */}
          {cableFields.map((f) => (
            <Th key={f.key}>{f.label}</Th>
          ))}
        </>
      }
      sections={shownNodes.map(({ node, depth, circuits }) => ({
        key: node.assetId,
        title: (
          /* 매달림은 **들여쓰기**로 보인다 — 소내전원반 아래 UPS, 그 아래 DC 48V.
             제목을 누르면 그 반이 오른쪽 패널에 열린다(표의 다른 선택과 같은 규칙). */
          <button
            type="button"
            onClick={() => onSelectAsset(node.assetId)}
            style={{ marginLeft: depth * 20 }}
            className={cn(
              'rounded px-1 text-left text-sm font-semibold text-content focus-visible:outline-none focus-ring-input',
              SELECTABLE,
              selectedAssetId === node.assetId && SELECTED,
            )}
          >
            {node.containerName ? `${node.containerName} · ${node.name}` : node.name}
          </button>
        ),
        meta: (
          <div style={{ marginLeft: depth * 20 }} className="flex flex-wrap items-center gap-x-3 text-xs text-content-muted">
            <span>입력: {sourceText(node)}</span>
            <span>
              회로 {node.circuits.length} · 사용 {node.circuits.filter((c) => c.cableId).length}
            </span>
          </div>
        ),
        rows: circuits.map((c) => (
          <tr
            key={c.portId}
            {...selectableRow(selectedAssetId, node.assetId, () => onSelectAsset(node.assetId, c.portId))}
            /* 모든 행이 같은 높이 — 패널 스케줄은 눈으로 회로를 세는 표다. */
            className={cn('h-11 border-b border-line focus-visible:outline-none focus-ring-input', SELECTABLE)}
          >
            <td className="px-3 py-1.5 text-sm text-content-muted tabular-nums">{c.index}</td>
            <td className="px-3 py-1.5">
              <ClosedCell assetId={node.assetId} portId={c.portId} closed={c.closed} />
            </td>
            {/* 용도 = 이 회로가 먹이는 것. 도면 밖 부하는 케이블에 적힌 대국까지가 전부다. */}
            <td className="truncate px-3 py-1.5">
              <PeerCell peer={c.load} />
            </td>
            {cableFields.map((f) => (
              <td key={f.key} className="px-3 py-1.5">
                <CableFieldInput cableId={c.cableId} value={c.values[f.key]} field={f} />
              </td>
            ))}
          </tr>
        )),
      }))}
      note={
        shownCircuits === 0 ? (
          <p className="px-1 pt-2 text-sm text-content-faint">
            {q ? `'${query.trim()}' 와 맞는 회로가 없습니다` : '회로가 없습니다'}
          </p>
        ) : null
      }
    />
  );
}
