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
 * 포트에 딸린 값 한 칸 — **무엇을 적는 칸인지는 종류 선언이 정한다**.
 *
 * 전원 포트에는 둘이 있다: 차단기 **용량**과 **개폐**. 둘 다 자산이 아니라 **그 회로**의
 * 것이다 — 출력이 열셋인 판은 회로마다 용량도 개폐도 따로다. 화면은 키를 알지 않고,
 * 자료형만 보고 그린다(참/거짓이면 스위치, 아니면 고쳐 쓰는 칸).
 *
 * 예전에는 이 자리가 「개폐 전용」이었다. 그래서 칸이 하나 늘 때마다 표도 손으로 고쳐야 했다.
 */
/* 값은 **나무가 준 것**을 받는다. 한때 여기서 스토어를 다시 뒤졌는데(`effectiveAssets().find`),
   셀렉터가 매 렌더 새 객체를 돌려주는 바람에 「getSnapshot should be cached」 무한 렌더가 나
   화면이 통째로 사라졌다 — 스토어 셀렉터는 원시값만 돌려준다(§스토어 규칙). */
function PortValueCell({ assetId, portId, field, value }: { assetId: string; portId: string; field: ValueDef; value: unknown }) {

  function write(next: unknown) {
    const live = useV2WorkingCopy.getState().effectiveAssets().find((a) => a.id === assetId);
    const target = live?.ports.find((p) => p.id === portId);
    if (!live || !target) return;
    const ports = live.ports.map((p) =>
      p.id === portId ? { ...p, fieldValues: setPortValueAt(p, 1, field.key, next) } : p,
    );
    useV2WorkingCopy.getState().stageAssetUpdate(assetId, { ports });
  }

  if (field.type === 'boolean') {
    return (
      <Toggle
        checked={value === true}
        onChange={write}
        size="sm"
        label={value === true ? 'ON' : 'OFF'}
        aria-label={field.label}
      />
    );
  }

  return (
    <InlineEditCell
      value={value === null || value === undefined ? '' : String(value)}
      onCommit={(raw) => {
        const next = field.type === 'number' ? (raw.trim() === '' ? null : Number(raw)) : (raw.trim() || null);
        if (field.type === 'number' && typeof next === 'number' && Number.isNaN(next)) return;
        if ((value ?? null) === next) return;
        write(next);
      }}
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : undefined}
      label={field.label}
      unit={field.unit}
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
  /* 케이블이 없으면 적을 곳도 없다 — 다만 대시는 **그 열의 줄맞춤을 따라야** 한다(td 가
     정한다). 인라인 span 이면 편집기가 선 줄과 대시만 선 줄에서 대시 위치가 어긋난다. */
  if (!cableId) return <span className="block px-1 text-sm text-content-faint">{EMPTY}</span>;

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
/**
 * 나무를 위에서 아래로 편 목록 — **거슬러 온 길**을 함께 들고 간다.
 *
 * 매달림을 들여쓰기로 보이려 했는데, 묶음마다 표가 따로 서는 판에서는 제목만 밀리고 표는
 * 제자리라 계층이 아니라 **어긋난 것**으로 읽혔다. 표를 통째로 밀면 이번에는 반마다 열의
 * 자리가 달라져 회로를 세로로 훑을 수가 없다(패널 스케줄은 그렇게 읽는 표다).
 *
 * 그래서 자리는 그대로 두고 **말로 적는다**: 「소내전원반 › UPS ›」. 차례(자식이 부모 바로
 * 밑에 온다)는 그대로라 순서로도 읽힌다.
 */
function flatten(nodes: PowerNode[], path: string[] = []): { node: PowerNode; path: string[] }[] {
  return nodes.flatMap((node) => [{ node, path }, ...flatten(node.children, [...path, node.name])]);
}

export function PowerRegisterView({ substationId: _substationId, selectedAssetId, onSelectAsset }: Props) {
  const effectiveAssets = useEffectiveAssets();
  const effectiveCables = useEffectiveCables();

  /* **칸이 몇이고 무엇인지는 종류 선언이 정한다** — 포트의 것(용량·개폐)과 케이블의 것
     (길이·전압·굵기). 여기에 키를 적어 두면 어휘가 늘 때마다 표를 손으로 고쳐야 한다. */
  const portFields = portFieldsFor(POWER_MEDIUM);
  const cableFields = cableFieldsFor(POWER_MEDIUM);
  const FIELD_WIDTH = 10;
  const fieldCount = portFields.length + cableFields.length;
  const widths = [
    8, // 회로
    ...portFields.map(() => FIELD_WIDTH),
    100 - 8 - FIELD_WIDTH * fieldCount, // 용도 — 남는 폭
    ...cableFields.map(() => FIELD_WIDTH),
  ];

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
    .map(({ node, path }) => ({ node, path, circuits: node.circuits.filter((c) => match(node, c)) }))
    .filter((n) => n.circuits.length > 0 || q === '');
  const totalCircuits = nodes.reduce((n, { node }) => n + node.circuits.length, 0);
  const shownCircuits = shownNodes.reduce((n, s) => n + s.circuits.length, 0);

  /**
   * **아직 안 이은 것과 밖에서 오는 것은 다르다.**
   *
   * 케이블이 아예 없으면 그린 사람이 아직 안 그린 것이고(할 일), 케이블은 있는데 상대가 이
   * 도면에 없으면 소내 전원처럼 밖에서 오는 것이다(정상). 둘을 같은 말로 적으면 결선이
   * 빠진 국이 다 갖춰진 것처럼 보인다.
   */
  const unwiredText = (cableId: string | null) => (cableId ? '이 도면 밖' : '미결선');

  /* 값 칸의 **줄맞춤은 열이 정한다** — 수는 오른쪽, 글자는 왼쪽. 칸마다 정하면 같은 열에서
     대시가 들쭉날쭉해진다(케이블이 있는 줄은 편집기가, 없는 줄은 대시가 각자 맞췄다). */
  const alignOf = (field: ValueDef) => (field.type === 'number' ? 'text-right tabular-nums' : 'text-left');

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
          {portFields.map((f) => (
            <Th key={f.key}>{f.label}</Th>
          ))}
          <Th>용도</Th>
          {/* 단위는 머리글이 아니라 **값 뒤에** 붙는다 — 선번장과 같은 규칙. */}
          {cableFields.map((f) => (
            <Th key={f.key}>{f.label}</Th>
          ))}
        </>
      }
      sections={shownNodes.map(({ node, path, circuits }) => ({
        key: node.assetId,
        title: (
          /* 거슬러 온 길을 앞에 흐리게 적는다 — 매달림이 자리를 옮기지 않고 읽힌다.
             제목을 누르면 그 반이 오른쪽 패널에 열린다(표의 다른 선택과 같은 규칙). */
          <button
            type="button"
            onClick={() => onSelectAsset(node.assetId)}
            className={cn(
              'rounded px-1 text-left text-sm font-semibold text-content focus-visible:outline-none focus-ring-input',
              SELECTABLE,
              selectedAssetId === node.assetId && SELECTED,
            )}
          >
            {path.length > 0 && (
              <span className="font-normal text-content-faint">{path.join(' › ')} › </span>
            )}
            {node.containerName ? `${node.containerName} · ${node.name}` : node.name}
          </button>
        ),
        meta: (
          /* 「어디서 받는가」는 이제 **표 안 첫 줄**이 말한다 — 거기서는 길이·전압·개폐까지
             회로와 같은 칸에 선다. 머리줄에 또 적으면 같은 말이 두 번이고, 값은 못 고친다. */
          <div className="text-xs text-content-muted">
            회로 {node.circuits.length} · 사용 {node.circuits.filter((c) => c.cableId).length}
          </div>
        ),
        rows: [
          /* **입력도 한 줄이다.** 어디서 오는지·개폐·길이·전압을 회로와 같은 칸에서 읽고
             고친다. 입력 차단기는 출력 개폐와 다른 물건이다(주차단기·입력 MCCB). */
          ...node.sources.map((src) => (
            <tr
              key={src.portId}
              {...selectableRow(selectedAssetId, node.assetId, () => onSelectAsset(node.assetId, src.portId))}
              className={cn(
                'h-11 border-b border-line bg-surface-sunken/60 focus-visible:outline-none focus-ring-input',
                SELECTABLE,
              )}
            >
              <td className="px-3 py-1.5 text-sm font-medium text-content">입력</td>
              {portFields.map((f) => (
                <td key={f.key} className={cn('px-3 py-1.5', alignOf(f))}>
                  <PortValueCell assetId={node.assetId} portId={src.portId} field={f} value={src.portValues[f.key]} />
                </td>
              ))}
              <td className="truncate px-3 py-1.5">
                {src.from ? <PeerCell peer={src.from} /> : <span className="text-sm text-content-faint">{unwiredText(src.cableId)}</span>}
              </td>
              {cableFields.map((f) => (
                <td key={f.key} className={cn('px-3 py-1.5', alignOf(f))}>
                  <CableFieldInput cableId={src.cableId} value={src.values[f.key]} field={f} />
                </td>
              ))}
            </tr>
          )),
          ...circuits.map((c) => (
          <tr
            key={c.portId}
            {...selectableRow(selectedAssetId, node.assetId, () => onSelectAsset(node.assetId, c.portId))}
            /* 모든 행이 같은 높이 — 패널 스케줄은 눈으로 회로를 세는 표다. */
            className={cn('h-11 border-b border-line focus-visible:outline-none focus-ring-input', SELECTABLE)}
          >
            <td className="px-3 py-1.5 text-sm text-content-muted tabular-nums">{c.index}</td>
            {portFields.map((f) => (
              <td key={f.key} className={cn('px-3 py-1.5', alignOf(f))}>
                <PortValueCell assetId={node.assetId} portId={c.portId} field={f} value={c.portValues[f.key]} />
              </td>
            ))}
            {/* 용도 = 이 회로가 먹이는 것. 도면 밖 부하는 케이블에 적힌 대국까지가 전부다. */}
            <td className="truncate px-3 py-1.5">
              <PeerCell peer={c.load} />
            </td>
            {cableFields.map((f) => (
              <td key={f.key} className={cn('px-3 py-1.5', alignOf(f))}>
                <CableFieldInput cableId={c.cableId} value={c.values[f.key]} field={f} />
              </td>
            ))}
          </tr>
          )),
        ],
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
