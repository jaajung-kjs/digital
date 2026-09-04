import type { TraceHop } from './graph.js';

/**
 * 추적 결과를 **트리로** 세운다 — 갈래는 갈래로, 곧은 길은 곧게.
 *
 * `traceFrom` 이 주는 것은 너비 우선으로 훑은 **평평한 홉 목록**이다. 화면은 그것을 번호가
 * 붙은 한 줄짜리 목록으로 폈는데, 그러면 두 가지가 사라진다:
 *
 * - **갈래**: 분전반 피더 하나에서 열 회로가 나가면 열 개가 같은 깊이의 형제인데, 평평한
 *   목록에서는 그냥 2·3·4… 번으로 줄줄이 서서 직렬로 읽힌다.
 * - **뜻**: 「↔ 내부」 라는 줄이 사이사이 끼었다. 그것은 **장비 안에서 포트가 바뀐 것**이지
 *   어디로 간 것이 아니다 — 사람이 알고 싶은 것은 「무엇을 거쳐 어디에 닿았나」다.
 *
 * 그래서 **케이블을 타고 닿은 자리만** 마디가 된다. 장비 안의 통과는 마디를 만들지 않고,
 * 그 장비에서 나가는 갈래들을 **그 자리에 붙인다** — 들어온 포트와 나가는 포트가 다르다는
 * 사실은 다음 마디의 이름이 이미 말한다.
 *
 * **다심(OPGW) 포트도 마디가 아니다.** 케이블로 닿기는 하지만 거기 서 있는 것은 아무것도
 * 없다 — 코어가 지나가는 자리일 뿐이고, 그 너머의 성단·점퍼를 거쳐야 비로소 장비가 나온다.
 * 마디로 세웠더니 24심이 다 같은 포트 하나라 이름이 `슬롯#1` 로 겹쳤고, 무엇보다 **거기서
 * 끝난 길은 아무 데도 닿지 않은 길**이었다(대국이 아직 성단되지 않은 코어). 접어 두면
 * 이어진 코어는 그 장비가 마디로 서고, 안 이어진 코어는 마디가 없다 — 그대로가 답이다.
 */
export interface TraceTreeNode {
  /** 이 마디에 닿은 포트 — 뿌리는 추적을 시작한 포트다. */
  portId: string;
  /** 여기로 오는 데 탄 케이블 — 뿌리에는 없다. */
  cableId?: string;
  /** 여기서 갈라져 나가는 길들. */
  children: TraceTreeNode[];
}

/**
 * 홉 목록 → 트리. 홉은 한 포트를 **한 번만** 방문하므로(`traceFrom` 의 `visited`) 이미
 * 뻗은 나무이고, 여기서 하는 일은 그 부모-자식을 세우고 내부 통과를 접는 것뿐이다.
 */
export function buildTraceTree(hops: readonly TraceHop[], startPortId: string): TraceTreeNode {
  const childrenOf = new Map<string, TraceHop[]>();
  for (const hop of hops) {
    const list = childrenOf.get(hop.fromPortId);
    if (list) list.push(hop);
    else childrenOf.set(hop.fromPortId, [hop]);
  }

  /**
   * 이 포트에서 뻗는 갈래들 — **케이블만 마디가 된다.**
   *
   * 내부 통과는 마디를 만들지 않고 그 너머를 이 자리로 끌어올린다(접기). 같은 장비 안에서
   * 포트를 두 번 갈아타도 마찬가지다 — 접힌 자리는 재귀가 알아서 따라간다.
   */
  const branchesOf = (portId: string, seen: Set<string>): TraceTreeNode[] => {
    if (seen.has(portId)) return [];
    seen.add(portId);
    const out: TraceTreeNode[] = [];
    for (const hop of childrenOf.get(portId) ?? []) {
      /* 내부 통과와 **다심 포트로 드는 길**은 마디를 만들지 않는다 — 둘 다 지나가는 자리다.
         (`core` 는 다심으로 들어갈 때만 붙는다 — `traceFrom` 참조) */
      if (hop.kind === 'internal' || hop.core !== undefined) {
        out.push(...branchesOf(hop.toPortId, seen));
        continue;
      }
      const node: TraceTreeNode = { portId: hop.toPortId, children: branchesOf(hop.toPortId, seen) };
      if (hop.cableId !== undefined) node.cableId = hop.cableId;
      out.push(node);
    }
    return out;
  };

  return { portId: startPortId, children: branchesOf(startPortId, new Set()) };
}

/**
 * 트리를 **끝까지 가는 길들**로 편다 — 뿌리에서 잎 하나까지가 한 길이다.
 *
 * 거슬러 오르는 추적(내 전원이 어디서 오나)은 트리로 읽히지 않는다. 답은 「출처에서 나에게
 * 오는 길」이고, 사람은 그것을 **전기가 흐르는 차례**로 읽는다 — 출처가 위, 내가 아래.
 * 그러려면 길을 하나씩 뽑아 뒤집어야 한다. 갈래가 있으면(이중 인입) 길이 여럿이고, 그때는
 * 「이 두 길로 전원이 온다」가 맞는 답이다.
 *
 * 뿌리를 포함해서 돌려준다 — 뒤집으면 그 뿌리가 **마지막**(내가 선 자리)이 된다.
 */
export function traceChains(root: TraceTreeNode): TraceTreeNode[][] {
  if (root.children.length === 0) return [[root]];
  return root.children.flatMap((child) => traceChains(child).map((path) => [root, ...path]));
}

/** 트리에 마디가 몇이나 되나 — 뿌리는 빼고 센다(「이 포트에서 닿는 곳」의 수). */
export function traceTreeSize(node: TraceTreeNode): number {
  return node.children.reduce((n, c) => n + 1 + traceTreeSize(c), 0);
}

/** 레인 그래프의 줄 하나 — 마디 하나와 그 옆을 지나는 레인들. */
export interface TraceLaneRow {
  node: TraceTreeNode;
  /** 이 마디가 선 레인(0부터). */
  lane: number;
  /** 이 줄에서 **닫히는** 레인들 — 위에서 내려와 이 마디로 꺾여 든다(합류). */
  merges: readonly number[];
  /** 마디도 합류도 아닌, 이 줄을 위아래로 **그냥 지나가는** 레인들. */
  through: readonly number[];
  /** 이 마디의 레인이 위에서 이어져 오는가 — 잎(출처)이면 여기서 시작한다. */
  fromAbove: boolean;
  /** 이 마디의 레인이 아래로 이어지는가 — 뿌리(나)면 여기서 끝난다. */
  toBelow: boolean;
}

/**
 * 거슬러 오르는 추적을 **레인 그래프**로 편다 — 출처가 위, 내가 맨 아래.
 *
 * 트리로는 이 모양을 담을 수 없다. **트리는 갈라지는 것만 그린다.** 내려가는 추적은
 * 나에게서 갈라져 나가니 트리가 딱 맞지만, 거슬러 오르는 길은 **여럿이 나에게로 모인다**.
 * 그것을 트리에 억지로 담으려다 세 번 깨졌다: 경로마다 한 줄로 펴면 겹치는 꼬리가
 * 되풀이되고, 위아래로 뒤집으면 「자식이 부모 위」라는 낯선 규칙을 익혀야 하고, 좌우로
 * 뒤집으면 깊이 셋에서 이미 판을 넘친다(394px 대 303px).
 *
 * 모이는 그림을 좁은 세로 칸에 그리는 방법은 이미 있다 — **커밋 그래프**다
 * (`git log --graph`). 마디는 한 줄씩 내려가고, 레인은 세로줄로 남고, 합류는 꺾임으로
 * 그린다. 값이 되는 성질: **깊이가 늘어도 폭이 안 변한다.** 폭을 먹는 것은 깊이가 아니라
 * 「동시에 살아 있는 갈래 수」이고, 상류에서 그것은 곧 출처의 수다(보통 둘·셋).
 *
 *   ● 분배부 · 교류 출력 1
 *   ● IR-48 #1 · 전원 출력
 *   │ ● 분배부 · 교류 출력 2
 *   │ ● IR-48 #2 · 전원 출력
 *   │ │ ● 축전지 · 축전지 단자
 *   ●─┴─╯ 분배부 · 직류 출력 2
 *   ◉ SID-125 · 전원 입력
 *
 * 커밋 그래프의 어려운 부분(금지 열 계산, 레인 파편화)은 머지가 부모를 여럿 갖기
 * 때문인데, 추적 결과는 마디마다 부모가 하나뿐이라(`traceFrom` 의 `visited`) 그 사정이
 * 없다. 자식을 먼저 내고, 마디는 **첫 자식의 레인을 물려받고**, 나머지 자식의 레인은
 * 그 자리에서 닫는다. 닫힌 레인은 **다시 쓴다** — 안 그러면 갈래가 끝나도 폭이 안 준다.
 */
export function traceLanes(root: TraceTreeNode): TraceLaneRow[] {
  const rows: TraceLaneRow[] = [];
  /** 지금 살아 있는 레인들 — 닫히면 그 번호를 되쓴다. */
  const open = new Set<number>();
  const take = (): number => {
    let i = 0;
    while (open.has(i)) i += 1;
    open.add(i);
    return i;
  };
  /** 이 줄을 그냥 지나가는 레인들 — 살아 있는 것 중 제 레인이 아닌 것. */
  const passing = (lane: number): number[] => [...open].filter((l) => l !== lane).sort((a, b) => a - b);

  const walk = (node: TraceTreeNode, root_: boolean): number => {
    if (node.children.length === 0) {
      const lane = take();
      rows.push({ node, lane, merges: [], through: passing(lane), fromAbove: false, toBelow: !root_ });
      return lane;
    }
    /* 자식(출처)을 먼저 낸다 — 이 차례가 곧 「출처에서 나에게로」다. */
    const lanes = node.children.map((c) => walk(c, false));
    const lane = lanes[0]!;
    const merges = lanes.slice(1);
    for (const l of merges) open.delete(l);
    rows.push({ node, lane, merges, through: passing(lane), fromAbove: true, toBelow: !root_ });
    return lane;
  };
  walk(root, true);
  return rows;
}

/** 들여쓰기 트리의 줄 하나 — 마디 하나와 그 왼쪽을 지나는 세로선들. */
export interface TraceIndentRow {
  node: TraceTreeNode;
  /** 들여쓰기 켜 — 뿌리가 0. */
  depth: number;
  /** 이 줄 왼쪽을 **지나가는** 켜들 — 위 조상 중 아직 형제가 남은 것. */
  rails: readonly number[];
  /** 제 형제 중 마지막인가 — 이음선이 꺾여 끝난다(└). 아니면 이어진다(├). */
  last: boolean;
}

/**
 * 내려가는 추적을 **들여쓰기 줄들**로 편다 — 나에게서 갈라져 나간다.
 *
 * 트리 모양 그대로지만 **평평한 줄 목록**으로 낸다. 그러면 레인 그래프와 **같은 조각으로**
 * 그릴 수 있다: 두 그림이 같은 점·같은 선·같은 눈높이를 쓴다.
 *
 * 예전에는 중첩 `<ul>` 에 `border-l` 과 `└`·`├` **글자**로 그렸다. 글자 이음선은 줄
 * 사이(line-height)에서 끊겨 실선이 점선처럼 보이고, 굵기와 색이 그린 선과 달라 같은
 * 화면에 두 어법이 섰다.
 */
export function traceIndentRows(root: TraceTreeNode): TraceIndentRow[] {
  const rows: TraceIndentRow[] = [];
  const walk = (node: TraceTreeNode, depth: number, rails: number[], last: boolean): void => {
    rows.push({ node, depth, rails: [...rails], last });
    /* 내 자식들의 줄에서 **내 이음선 켜**(`depth - 1`)에 세로선이 계속 지나가는가 —
       내가 형제 중 마지막이 아니라면 그렇다. 그게 「아래에 형제가 더 있다」는 표시다. */
    const forChildren = depth > 0 && !last ? [...rails, depth - 1] : rails;
    node.children.forEach((child, i) =>
      walk(child, depth + 1, forChildren, i === node.children.length - 1));
  };
  walk(root, 0, [], true);
  return rows;
}
