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
import { Th, SegmentedControl, cn, SELECTABLE, SELECTED, EMPTY, selectableRow, TABLE_ROW, Td} from '../../../components/ui';
import { RegisterLayout } from './RegisterLayout';
import { useEffectiveAssets, useEffectiveCables } from '../../store/useWorkingCopy';
import { useV2WorkingCopy } from '../../store/workingCopyStore';
import { powerTree, POWER_MEDIUM } from '../../powerSelectors';
import { cableFieldsFor, polesOf, portFieldsFor, type ValueDef } from '@twin/core';
import type { PowerCircuit, PowerNode } from '../../powerSelectors';
import type { V2Assembly } from '../../types';
import { PeerCell } from './PeerCell';
import { InlineEditCell } from '../InlineEditCell';
import { PortValueControl } from '../detail/PortValueControl';

interface Props {
  substationId: string;
  selectedAssetId: string | null;
  /** 지금 고른 포트 — 주소가 쥔다(`?port=`). 판에서 골라도 이 줄이 칠해진다. */
  selectedPortId: string | null;
  onSelectAsset: (id: string | null, portId?: string | null) => void;
  /**
   * 빈 칸에서 **케이블을 잇기 시작한다** — 그 포트가 출발이 된다.
   *
   * 페이지가 내려 주는 길은 하나다(`connectFromPort`). 포트 탭·선번장·계통이 같은 함수를
   * 부르므로 어느 진입점에서 시작해도 같은 세션이 서고, 이으면 세션의 `origin` 이 이 표로
   * 돌려보낸다.
   */
  onConnect?: (portId: string) => void;
  /**
   * 설비 품목들 — **어느 배선이 함체 속살인지**가 여기 못 박혀 있다(`AssemblyLink`).
   *
   * 이 판이 직접 읽지 않고 **받는다**: 자료를 읽는 훅을 화면 안에 두면 판 하나를 그려 보는
   * 일에도 질의 공급자가 필요해진다(시험이 그것부터 막힌다).
   */
  assemblies?: readonly V2Assembly[];
  /** 장비 종류들 — 어느 것이 반인지는 여기 선언돼 있다(`managesPowerCircuits`). */
  types?: readonly { id: string; managesPowerCircuits: boolean }[];
}

// PeerCell은 공용 컴포넌트 사용 (M-2 — FiberRegisterView와 공유)

// ── 케이블 값 인라인 편집 (케이블 없으면 EMPTY 비편집) ────────────────────────
interface CableFieldInputProps {
  cableId: string | null;
  value: unknown;
  /** 어떤 값을 적는 칸인지 — 키·자료형이 여기서 나온다. 화면이 키를 알지 않는다. */
  field: ValueDef;
  /** 모선이 이미 말한 값인가 — 그러면 흐리게(대장의 ditto). */
  muted?: boolean;
}

function CableFieldInput({ cableId, value, field, muted }: CableFieldInputProps) {
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
      muted={muted}
      onCommit={handleCommit}
      type={isNumber ? 'number' : field.type === 'date' ? 'date' : undefined}
      label={field.label}
      unit={field.unit}
      /* 고를 수 있는 값이 선언돼 있으면 목록으로 — 화면이 그 목록을 알지 않는다. */
      options={field.options}
    />
  );
}

/**
 * 계통 갈래 — **장을 나눈다.**
 *
 * 강원본부 통신실 전원계통도가 같은 배치도 위에 「전체 · AC · DC」 세 장을 따로 그려 둔
 * 그것이다. 한 장에 다 그리면 선이 겹쳐 아무것도 안 읽힌다.
 *
 * 갈래 값(`AC`·`DC`)은 포트가 이미 들고 있다(`PortRef.variant`) — 여기서 알아맞히지 않는다.
 */
const FLOWS = [
  { key: 'all', label: '전체' },
  { key: 'AC', label: '교류' },
  { key: 'DC', label: '직류' },
] as const;
type FlowKey = (typeof FLOWS)[number]['key'];


/**
 * 계통 표의 **값 칸들** — 화면과 시험이 같은 것을 본다.
 *
 * 한때 시험이 이 목록을 제 손으로 다시 세웠다. 그러다 칸이 늘자(상·선식·차단기) 시험만
 * 옛 목록을 보고 폭을 재, 화면은 멀쩡한데 시험이 깨졌다 — 같은 규칙은 한 곳에만 적는다.
 *
 * **전압도 회로의 것이다.** 한때 「모선의 성질」이라며 이 목록에서 뺐는데, 그건 절반만 맞는
 * 말이었다: 380/220V 3상4선 반은 한 모선에서 380V 3상(4P)과 220V 단상(2P)을 함께 내보내고,
 * 강릉 대장에는 같은 반에 110V 회로가 하나 섞여 있다. 빼는 순간 그 회로를 고칠 길이 사라진다.
 *
 * 스무 줄에 같은 값이 스무 번 서던 문제는 **지우는 것이 아니라 흐리게** 푼다 — 모선(입력
 * 줄)이 이미 말한 값은 회로 줄에서 흐리게 읽힌다(대장의 ditto). 다른 것만 눈에 걸린다.
 */
export function powerValueColumns(): { field: ValueDef; from: 'port' | 'cable' }[] {
  return [
    ...portFieldsFor(POWER_MEDIUM)
      .filter((f) => f.type !== 'boolean' && !OFF_TABLE.has(f.key))
      .map((field) => ({ field, from: 'port' as const })),
    ...cableFieldsFor(POWER_MEDIUM)
      .filter((f) => !OFF_TABLE.has(f.key))
      .map((field) => ({ field, from: 'cable' as const })),
  ].sort((a, b) => (a.field.order ?? 99) - (b.field.order ?? 99));
}

/**
 * 이 표에 **열로는 세우지 않는** 값들 — 적을 곳은 포트 카드에 있다.
 *
 * 열 하나가 10%다(760px 판에서 76px). 아홉 열을 세웠더니 정작 자료가 채우는 **용도**가
 * 10%까지 굶어, 「전원분전반 #1 - 상용 피더」가 다 잘렸다. 무엇을 세울지는 실물 조서가
 * 정한다 — 이 표는 **회로 대장**이다.
 *
 * - `lengthM` — 조서에 **없다.** 강릉의 「전원케이블」 칸에 적힌 것은 `FR-5.5sq`, 곧 종류와
 *   굵기이고 길이가 아니다. SCADA 분전반 조서에는 케이블 칸 자체가 없다(번호·용량·규격·
 *   Type·부하). 길이는 회로의 성질이 아니라 **그 케이블의 물량**이라 산출이 쓴다.
 * - `breaker` — 쓰기는 쓴다(SCADA 조서의 「Type」에 MCCB·ABS 가 적혀 있고, 도면은 차단기를
 *   `NFB#1 2P 100A` 로 부른다). 다만 그 표에서 Type 은 **용량과 사실상 1:1**이고(200A·100A는
 *   MCCB, 30A·20A는 ABS) 강릉 조서(2019)에는 그 칸이 아예 없다. 정보량에 견주어 열 하나는
 *   비싸다 — 어휘는 남기고 열에서만 내린다. 실사에서 실제로 갈리는 값이 나오면 그때 올린다.
 */
const OFF_TABLE = new Set(['lengthM', 'breaker']);

/**
 * 회로 번호 칸 — **실물 라벨**이다.
 *
 * 품목이 지어 준 이름은 「분기 1」인데 현장 대장과 도면은 그 회로를 `NFB#11`·`SW-03` 이라
 * 부른다. 그 이름이 화면에 없으면 우리 표와 실물 차단기를 대조할 수가 없다 — 실사에서 바로
 * 막히는 자리다. 그래서 여기서 고친다(포트 이름은 그 포트에 담긴다).
 */
function CircuitLabel({ assetId, portId, name }: { assetId: string; portId: string; name: string }) {
  return (
    <InlineEditCell
      value={name}
      label="회로 이름"
      onCommit={(raw) => {
        const next = raw.trim();
        if (next === '' || next === name) return;
        const live = useV2WorkingCopy.getState().effectiveAssets().find((a) => a.id === assetId);
        if (!live) return;
        useV2WorkingCopy.getState().stageAssetUpdate(assetId, {
          ports: live.ports.map((p) => (p.id === portId ? { ...p, name: next } : p)),
        });
      }}
    />
  );
}

// ── 메인 뷰 ──────────────────────────────────────────────────────────────────
/**
 * 글자가 실제로 차지하는 폭 — **재서** 안다(브라우저의 글꼴로).
 *
 * 글자 수로 어림했다가 두 번 틀렸다: 한글과 숫자를 같은 한 글자로 세어 「12.5m」·「5.5sq」가
 * 모자랐고, 다시 고친 뒤에도 「AC 380V 3φ」가 **2px** 모자라 두 줄로 접혔다. 눈으로는
 * 멀쩡해 보이는 차이라 재 보기 전에는 알 수 없다.
 *
 * 시험 환경(jsdom)에는 글꼴이 없어 0 이 나온다 — 그때만 어림으로 물러선다.
 */
let ruler: CanvasRenderingContext2D | null = null;
function textPx(text: string): number {
  if (typeof document !== 'undefined' && !ruler) {
    ruler = document.createElement('canvas').getContext('2d');
    if (ruler) ruler.font = `14px ${getComputedStyle(document.body).fontFamily}`;
  }
  /* 시험 환경의 캔버스는 껍데기라 `measureText` 자체가 없을 수 있다 — 있는지부터 본다. */
  const measured = ruler?.measureText?.(text)?.width ?? 0;
  if (measured > 0) return measured;
  /* 못 재는 곳에서의 어림 — 한글은 넓고 숫자·영문은 좁다. */
  return [...text].reduce((n, ch) => n + (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(ch) ? 14 : 8), 0);
}

/**
 * 열 폭 — **그 칸에 실제로 설 수 있는 가장 긴 글자**가 정한다.
 *
 * 후보는 둘이다: 고를 수 있는 값(선언이 안다)과 지금 적혀 있는 값(자료가 안다). 둘 다 재서
 * 넓은 쪽을 쓴다 — 그래서 「600A」를 아직 아무도 안 골랐어도 골랐을 때 접히지 않는다.
 *
 * 남는 폭은 **용도**가 받는다(자료가 채우는 열이라 선언이 없다). 그 열은 길면 말줄임으로
 * 접는다 — 줄이 두 줄이 되는 것보다 낫다(표는 눈으로 회로를 세는 물건이다).
 *
 * @returns 회로 · 용도 · 값 칸들 · 상태 순의 비율(합 100).
 */
export function powerColumnWidths(
  valueFields: readonly ValueDef[],
  /** 스위치로 그리는 칸들 — 켜고 끈 말(「투입」·「개방」)까지 재야 잘리지 않는다. */
  stateFields: readonly ValueDef[],
  /** 지금 표에 적혀 있는 값들 — 필드 키마다. 선언된 목록과 함께 잰다. */
  written: Record<string, readonly string[]> = {},
): number[] {
  /** 읽는 줄의 좌우 여백(px-1) + 칸의 여백(px-3). */
  const PADDING_PX = 8 + 24;
  /* 수치 칸은 **자릿수 고정 글꼴**(`tabular-nums`)로 그린다 — 자를 대는 글꼴보다 숫자가
     조금 넓다. 실제로 「12345.6m」가 4px 모자라 접혔다. 그만큼 한 숨을 둔다. */
  const numericSlack = (f: ValueDef) => (f.type === 'number' ? 8 : 2);
  const widthPxOf = (f: ValueDef) =>
    numericSlack(f) + Math.max(
      textPx(f.label),
      ...(f.options ?? []).map((o) => textPx(String(o) + (f.unit ?? ''))),
      ...(written[f.key] ?? []).map(textPx),
      /* 바닥값은 **목록이 없을 때만** — 목록이 있으면 그 목록이 이미 최대치를 안다.
         있는데도 「12345.6m」만큼 잡아 두었더니 용량·규격이 필요보다 30px 씩 넓어, 그 폭이
         용도에서 빠져나갔다(긴 설비 이름이 말줄임으로 잘렸다). */
      f.options ? 0 : textPx('00000.0') + textPx(f.unit ?? ''),
    ) + PADDING_PX;

  /* 회로 칸은 **가장 긴 라벨**이 정한다 — 「분기 12」는 좁아도 되지만 실물 라벨(`NFB#11`)로
     고치고 나면 좁은 칸에서 두 줄로 접힌다. */
  const CIRCUIT_PX = Math.max(textPx('입력'), ...(written['__circuit'] ?? []).map(textPx)) + PADDING_PX;
  /** 스위치(24) + 간격(6) + 그 칸이 쓰는 말 중 긴 쪽. */
  const statePx = (f: ValueDef) =>
    24 + 6 + Math.max(textPx(f.label), textPx(f.trueLabel ?? 'ON'), textPx(f.falseLabel ?? 'OFF')) + PADDING_PX;
  /* 비율의 기준 폭 — 상세 패널을 연 1440px 화면에서 이 판이 서는 크기다. 더 넓어지면 다 같이
     넓어지고 좁아지면 다 같이 좁아진다(어느 한 열만 굶지 않는다). */
  const REFERENCE_PX = 760;

  const fixedPx = [CIRCUIT_PX, ...valueFields.map(widthPxOf), ...stateFields.map(statePx)];
  const fixedPct = fixedPx.map((px) => Math.round((px / REFERENCE_PX) * 1000) / 10);
  const purpose = Math.round((100 - fixedPct.reduce((a, b) => a + b, 0)) * 10) / 10;
  return [fixedPct[0]!, purpose, ...fixedPct.slice(1)];
}

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

export function PowerRegisterView({ substationId: _substationId, selectedAssetId, selectedPortId, onSelectAsset, onConnect, assemblies = [], types = [] }: Props) {
  const effectiveAssets = useEffectiveAssets();
  const effectiveCables = useEffectiveCables();

  /* **칸이 몇이고 무엇인지는 종류 선언이 정한다** — 포트의 것(용량·개폐)과 케이블의 것
     (길이·전압·굵기). 여기에 키를 적어 두면 어휘가 늘 때마다 표를 손으로 고쳐야 한다. */
  /* 열을 세울 때는 갈래를 모른다(줄마다 다르다) — 칸이 무엇무엇인지만 여기서 정하고,
     **고를 수 있는 값**은 줄이 제 갈래로 좁힌다(직류 회로에 교류 전압이 뜨지 않게). */
  const portFields = portFieldsFor(POWER_MEDIUM);
  const portFieldFor = (variant: string | null | undefined, key: string) =>
    portFieldsFor(POWER_MEDIUM, 1, variant).find((f) => f.key === key);
  /**
   * 열 차례는 **대장 그대로**다: 회로 · 용량 · 용도 · 전원케이블 · 상태.
   *
   * 상태(개폐)가 맨 끝인 데는 까닭이 있다 — 한 줄은 「몇 번 회로가, 몇 A로, 무엇에, 어떤
   * 케이블로」까지가 그 회로의 **신원**이고 개폐는 **지금 형편**이다. 신원 한가운데 스위치가
   * 끼면 눈이 거기서 한 번 걸린다. 가르는 것은 자료형이다(참/거짓이면 상태다).
   */
  const stateFields = portFields.filter((f) => f.type === 'boolean');
  /**
   * 값 칸들은 **한 줄로 읽힌다** — 길이 · 전압 · 용량 · 굵기.
   *
   * 용량은 포트에 담기고 전압·굵기는 케이블에 담기지만 그건 저장의 사정이고, 읽는 사람에게는
   * 전압(V) 옆에 용량(A)이 있어야 회로의 크기가 한눈에 잡힌다. 차례는 **선언이 정한다**
   * (`ValueDef.order`) — 여기서 키를 나열하면 어휘가 늘 때마다 이 파일을 고쳐야 한다.
   */
  const valueColumns = powerValueColumns();

  /* 이 국에 갈래가 하나뿐이면 나눌 것이 없다 — 탭 셋을 세워 놓고 둘이 늘 비면 군더더기다. */
  const [flow, setFlow] = useState<FlowKey>('all');


  /* 무엇이 반인지는 **종류 선언**이 정하고(`types`), 설비 품목의 **내부 배선 선언**이
     「함체 속살」과 「현장 회로」를 가른다 — 충전기 안의 정류기 배선은 계통도에 그리지
     않는다(계통도는 충전기를 한 상자로 그린다). */
  const tree = useMemo(
    () => powerTree(effectiveAssets, effectiveCables, assemblies, types),
    [effectiveAssets, effectiveCables, assemblies, types],
  );
  const nodes = useMemo(() => flatten(tree), [tree]);

  /* 지금 적혀 있는 값도 함께 잰다 — 선언에 없는 값(예전 자료·직접 입력)이 있어도 접히지 않게. */
  const written = useMemo(() => {
    const out: Record<string, string[]> = {};
    const add = (key: string, raw: unknown, unit?: string) => {
      if (raw === null || raw === undefined || raw === '') return;
      (out[key] ??= []).push(String(raw) + (unit ?? ''));
    };
    for (const { node } of nodes) {
      for (const src of node.sources) {
        for (const f of valueColumns) add(f.field.key, f.from === 'port' ? src.portValues[f.field.key] : src.values[f.field.key], f.field.unit);
      }
      for (const c of node.circuits) {
        add('__circuit', c.name);
        for (const f of valueColumns) add(f.field.key, f.from === 'port' ? c.portValues[f.field.key] : c.values[f.field.key], f.field.unit);
      }
    }
    return out;
  }, [nodes, valueColumns]);
  const widths = powerColumnWidths(valueColumns.map((c) => c.field), stateFields, written);

  /* 회로가 마흔인 국에서 「그 회로」를 찾는 길이 눈으로 훑는 것뿐이면 표가 아니다.
     보이는 값을 통째로 훑는다 — 사람은 이름을 기억하지 그것이 몇 번째 열인지는 모른다. */
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const match = (node: PowerNode, c: PowerCircuit) =>
    q === '' ||
    [c.name, c.load?.assetName, c.load?.assemblyName, node.name, node.containerName]
      .some((v) => (v ?? '').toLowerCase().includes(q));

  /** 이 줄이 지금 보는 장(章)의 것인가 — 갈래는 포트가 들고 있다(`variant`). */
  const inFlow = (v: string | null | undefined) => flow === 'all' || (v ?? null) === flow;

  const shownNodes = nodes
    .map(({ node, path }) => ({
      node, path,
      sources: node.sources.filter((s) => inFlow(s.variant)),
      circuits: node.circuits.filter((c) => inFlow(c.variant) && match(node, c)),
    }))
    /* 그 갈래에 회로가 없는 반은 **그 장에 서지 않는다** — 직류 장에 교류 피더가 뜨면
       나눈 뜻이 없다. 전체 장에서는 아직 회로를 안 이은 반도 남긴다(할 일이 보여야 한다). */
    .filter((n) => n.circuits.length > 0 || (q === '' && flow === 'all'));
  const totalCircuits = nodes.reduce((n, { node }) => n + node.circuits.filter((c) => inFlow(c.variant)).length, 0);
  const shownCircuits = shownNodes.reduce((n, s) => n + s.circuits.length, 0);

  /* 갈래가 하나뿐인 국에는 나눌 것이 없다 — 탭 셋을 세워 놓고 둘이 늘 비면 군더더기다. */
  const variantsHere = new Set(nodes.flatMap(({ node }) => node.circuits.map((c) => c.variant ?? null)));
  const flowItems = FLOWS.filter((f) => f.key === 'all' || variantsHere.has(f.key));

  /**
   * 이 반의 **모선** — 전압 · 상·선식(극수) · 정격.
   *
   * 현장 조서의 「CB : AC 3φ 220V 400A」 한 줄이다. 회로 줄마다 전압을 되풀이하는 대신
   * 여기서 한 번 말한다(스무 줄짜리 피더에서 같은 값이 스무 번 서던 자리다).
   * 값은 **입력(주차단기)의 것**이다 — 모선의 정격이 곧 그것이다.
   */
  const busOf = (node: PowerNode, srcs: PowerNode['sources']): string | null => {
    const src = srcs[0] ?? node.sources[0];
    if (!src) return null;
    const poles = polesOf(src.portValues.wiring);
    const wiring = src.portValues.wiring == null ? null
      : `${String(src.portValues.wiring)}${poles ? `(${poles})` : ''}`;
    const ampere = src.portValues.ampere == null ? null : `${String(src.portValues.ampere)}A`;
    return [src.portValues.voltage, wiring, ampere].filter(Boolean).map(String).join(' · ') || null;
  };

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
  const alignOf = (field: ValueDef) => (field.type === 'number' ? 'right' as const : 'left' as const);

  return (
    <RegisterLayout
      selectedKey={selectedPortId ?? selectedAssetId}
      empty={{
        title: '계통에 표시할 전원 설비가 없습니다',
        description: '분전반·UPS·충전기처럼 전원을 나눠 주는 장비를 놓으면 나타납니다.',
      }}
      filter={flowItems.length > 1 ? (
        <SegmentedControl aria-label="계통 갈래" items={flowItems} value={flow} onChange={setFlow} />
      ) : undefined}
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
          <Th>용도</Th>
          {/* 단위는 머리글이 아니라 **값 뒤에** 붙는다 — 선번장과 같은 규칙. */}
          {[...valueColumns.map((c) => c.field), ...stateFields].map((f) => (
            <Th key={f.key} align={alignOf(f)}>{f.label}</Th>
          ))}
        </>
      }
      sections={shownNodes.map(({ node, path, sources, circuits }) => ({
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
          <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-content-muted">
            {/* 모선의 정격 — 조서의 「CB : AC 3φ 220V 400A」 자리다. */}
            {busOf(node, sources) && <span className="font-medium text-content">{busOf(node, sources)}</span>}
            <span>회로 {circuits.length} · 사용 {circuits.filter((c) => c.cableId).length}</span>
            {/* 나누지 않고 **거쳐 온 것들** — 정류기·인버터는 제 표를 갖지 않는다. */}
            {sources.flatMap((src) => src.via).length > 0 && (
              <span>{[...new Set(sources.flatMap((src) => src.via.map((v) => v.name)))].join(' › ')} 거쳐</span>
            )}
          </div>
        ),
        rows: [
          /* **입력도 한 줄이다.** 어디서 오는지·개폐·길이·전압을 회로와 같은 칸에서 읽고
             고친다. 입력 차단기는 출력 개폐와 다른 물건이다(주차단기·입력 MCCB). */
          ...sources.map((src) => (
            <tr
              key={src.portId}
              /* 줄의 신원은 **그 포트**다 — 자산으로 칠하면 그 반의 열 줄이 한꺼번에 물들어
                 어느 회로를 골랐는지가 화면에서 사라진다. */
              {...selectableRow(selectedPortId, src.portId, () => onSelectAsset(node.assetId, src.portId))}
              className={cn(TABLE_ROW, 'bg-surface-sunken/60', SELECTABLE, selectedPortId === src.portId && SELECTED)}
            >
              {/* 편집 칸과 **같은 안쪽 여백**을 안쪽 span 이 갖는다 — 칸(`Td`)의 여백을
                  건드리면 그 칸만 12px 왼쪽으로 밀려 「입력」과 「분기 1」의 왼끝이 어긋난다
                  (편집 칸은 `Td` 여백 **안에서** 다시 `px-1` 을 갖는다). */}
              <Td><span className="block px-1 text-sm font-medium text-content">입력</span></Td>
              <Td className="truncate">
                {/* 빈 칸도 대국 칸이 그린다 — 「미결선」이면 잇는 자리, 케이블이 이미 있고
                    대국만 도면 밖이면 글자 그대로다(자리가 두 번 팔리지 않게). */}
                <PeerCell
                  peer={src.from}
                  onSelect={onSelectAsset}
                  emptyLabel={unwiredText(src.cableId)}
                  {...(onConnect && !src.cableId ? { onConnect, selfPortId: src.portId } : {})}
                />
              </Td>
              {valueColumns.map(({ field, from }) => (
                <Td key={field.key} align={alignOf(field)}>
                  {from === 'port' ? (
                    <PortValueControl
                      assetId={node.assetId}
                      portId={src.portId}
                      field={portFieldFor(src.variant, field.key) ?? field}
                      value={src.portValues[field.key]}
                    />
                  ) : (
                    <CableFieldInput cableId={src.cableId} value={src.values[field.key]} field={field} />
                  )}
                </Td>
              ))}
              {stateFields.map((f) => (
                <Td key={f.key}>
                  <PortValueControl assetId={node.assetId} portId={src.portId} field={f} value={src.portValues[f.key]} />
                </Td>
              ))}
            </tr>
          )),
          ...circuits.map((c) => (
          <tr
            key={c.portId}
            {...selectableRow(selectedPortId, c.portId, () => onSelectAsset(node.assetId, c.portId))}
            /* 높이는 표가 정한다(`TABLE_ROW`) — 화면마다 적으면 같은 표가 다르게 보인다. */
            className={cn(TABLE_ROW, SELECTABLE, selectedPortId === c.portId && SELECTED)}
          >
            <Td><CircuitLabel assetId={node.assetId} portId={c.portId} name={c.name} /></Td>
            {/* 용도 = 이 회로가 먹이는 것. 도면 밖 부하는 케이블에 적힌 대국까지가 전부다. */}
            {/* 아직 아무것도 안 문 회로는 **예비**다 — 조서가 그 자리를 그렇게 부른다.
                빈칸으로 두면 「적다 만 것」과 「비워 둔 것」이 같아 보인다. */}
            <Td className="truncate">
              <PeerCell
                peer={c.load}
                onSelect={onSelectAsset}
                emptyLabel={c.cableId ? '이 도면 밖' : '예비'}
                {...(onConnect && !c.cableId ? { onConnect, selfPortId: c.portId } : {})}
              />
            </Td>
            {valueColumns.map(({ field, from }) => {
              const value = from === 'port' ? c.portValues[field.key] : c.values[field.key];
              /* **모선이 이미 말한 값**이면 흐리게 — 대장의 ditto 다. 어느 칸인지 여기서
                 알아맞히지 않는다(「전압이면」 같은 규칙을 적으면 어휘가 늘 때마다 갈린다).
                 입력 줄과 같은 값이면 흐리다, 한 문장이면 족하다. */
              const bus = sources[0]
                ? (from === 'port' ? sources[0].portValues[field.key] : sources[0].values[field.key])
                : undefined;
              const ditto = value != null && bus != null && String(value) === String(bus);
              return (
                <Td key={field.key} align={alignOf(field)}>
                  {from === 'port' ? (
                    <PortValueControl
                      assetId={node.assetId}
                      portId={c.portId}
                      field={portFieldFor(c.variant, field.key) ?? field}
                      value={value}
                      muted={ditto}
                    />
                  ) : (
                    <CableFieldInput cableId={c.cableId} value={value} field={field} muted={ditto} />
                  )}
                </Td>
              );
            })}
            {stateFields.map((f) => (
              <Td key={f.key}>
                <PortValueControl assetId={node.assetId} portId={c.portId} field={f} value={c.portValues[f.key]} />
              </Td>
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
