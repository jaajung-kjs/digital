import type { AssetTypeSpec, PortRef, PortTemplate } from './types.js';
import { instantiatePorts } from './instantiatePorts.js';
import { placementAt, validateGridPlacement, type GridOccupant } from '../validation/gridPlacement.js';
import { validateConnection } from '../validation/connection.js';

/**
 * 설비 품목 — **격자 하나에 장비를 놓아 만든 한 설비**.
 *
 * 예전에는 자리를 장비 품목이 선언했다(랙의 「슬롯 12칸」). 그래서 담기 위한 랙이라는
 * 자산이 따로 있어야 했고 그 랙이 현황에 올라왔다. 슬롯은 사실 폭이 격자 전체인 1열짜리
 * 격자였을 뿐이라, 격자를 설비 품목이 직접 가지면 그 층이 통째로 사라진다.
 *
 *   before  도면 → 랙(자산) → 컨테이너(슬롯) → 장비(자산)
 *   after   도면 → 설비(설비 품목의 격자)            → 장비(자산)
 *
 * **평평하다.** 장비가 또 장비를 담지 않는다 — OFD 도 「경로슬롯 4장이 놓인 설비 품목」이고,
 * 다른 설비 안에 들어가는 것이 아니라 도면에 바로 놓인다.
 */
export interface AssemblySpec {
  key: string;
  name: string;
  items: AssemblyItemSpec[];
  /**
   * **설비 안에서 이미 이어져 있는 것** — 놓으면 이 케이블들이 함께 선다.
   *
   * 랙 한 대짜리 설비의 안쪽 배선은 어느 국에 놓든 같다(정류기 출력이 모선에 물리는 자리는
   * 설비의 생김새이지 그 국의 사정이 아니다). 없으면 빈 것으로 읽는다 — 링크가 없는 설비
   * 품목이 예사다(OFD 는 판끼리 안 잇는다).
   */
  links?: AssemblyLinkSpec[];
}

/**
 * 구성 항목의 포트 하나와 또 하나를 잇는 줄.
 *
 * **왜 포트 id 가 아니라 `묶음:번호` 인가**: 구성 항목에는 포트가 없다. 포트는 자산이 생길
 * 때 타입의 선언에서 펴진다(`instantiatePorts`). 그래서 가리킬 id 가 아직 없고, 선언이
 * 이름을 붙이는 방식 그대로 부른다 — 자산을 만들 때 포트 id 를 `묶음:번호` 로 키 잡아
 * 넘기는 것과 같은 이름표다(`placeAssembly`).
 */
export interface AssemblyLinkSpec {
  id: string;
  /** 이 설비 품목 안의 항목 id. */
  aItemId: string;
  aGroup: string;
  /** 1부터. */
  aIndex: number;
  bItemId: string;
  bGroup: string;
  bIndex: number;
  /** 케이블 종류 — 안 정했으면 null. */
  categoryId?: string | null;
  /** 그 케이블의 값(규격 sq 등). */
  specParams?: Record<string, unknown>;
}

/** 링크가 가리키는 한쪽 끝. */
export interface AssemblyLinkEnd {
  itemId: string;
  group: string;
  index: number;
}

/** 링크의 양끝을 짝지어 읽는다 — 두 곳에서 `a…`/`b…` 를 따로 풀지 않게. */
export function linkEnds(link: AssemblyLinkSpec): [AssemblyLinkEnd, AssemblyLinkEnd] {
  return [
    { itemId: link.aItemId, group: link.aGroup, index: link.aIndex },
    { itemId: link.bItemId, group: link.bGroup, index: link.bIndex },
  ];
}

/** 포트 하나를 가리키는 열쇠 — 자산을 만들 때 포트 id 를 키 잡는 방식과 **같은 글자**다. */
export function linkPortKey(end: AssemblyLinkEnd): string {
  return `${end.itemId}|${end.group}:${end.index}`;
}

/** 설비 품목의 격자에 놓인 장비 하나 — 어느 타입을, 격자의 어느 자리에. */
export interface AssemblyItemSpec {
  /** 설비 품목 안에서 유일한 식별자. */
  id: string;
  /**
   * 그 자리에 서는 장비 품목 — **비어 있을 수 있다**(`null` = 빈 슬롯).
   *
   * 실물 랙은 「구성은 같고 실장만 다르다」: 8410P 는 서비스 슬롯이 열인데 두 장만 꽂혀
   * 있고, OFD 는 24심 판인데 12심만 성단돼 있다. 자리를 못 적으면 그 표준이 반쪽이 된다 —
   * 나중에 카드를 꽂는 사람이 **크기와 자리를 매번 새로 정해야** 하고, 그러면 국마다 같은
   * 슬롯이 다른 크기로 굳는다.
   *
   * **빈 슬롯은 장비가 아니다.** 놓아도 자산이 안 생긴다 — 없는 물건이 산출·현황·미점검에
   * 세어지면 안 된다. 자리와 이름만 설비 품목에 남고, 화면은 그 자리를 점선으로 그린다.
   */
  typeKey: string | null;
  name: string;
  col: number | null;
  row: number | null;
  colSpan: number | null;
  rowSpan: number | null;
  portCounts?: Record<string, number>;
  portPositions?: Record<string, number>;
}

export type AssemblyError =
  | 'unknown-type' | 'out-of-range' | 'overlap' | 'empty-name' | 'bad-port-count'
  /** 링크가 없는 항목이나 없는 포트를 가리킨다 — 항목을 지웠는데 줄이 남은 경우. */
  | 'link-endpoint'
  /** 이을 수 없는 짝 — 매체·방향·갈래·심선 수(`validateConnection` 이 판정한다). */
  | 'link-invalid'
  /** 한 포트에 둘을 물렸다. */
  | 'link-occupied';

/**
 * 설비 품목이 말이 되는가. null = 유효.
 *
 * 저장 전에 여기서 걸러야 배치할 때 터지지 않는다 — 설비 품목에서는 놓였는데 실제 배치에서
 * 튕기면 짠 사람이 무엇이 잘못됐는지 알 길이 없다.
 */
export function validateAssembly(
  spec: AssemblySpec,
  typeKeys: ReadonlySet<string>,
  /**
   * 그 종류가 선언한 포트 — **링크를 볼 때만** 필요하다.
   *
   * 구성 항목에는 포트가 없으므로(자산이 생길 때 펴진다) 링크의 양끝이 실재하는지,
   * 그 둘이 이어질 수 있는지를 보려면 선언을 읽어야 한다. 링크가 없는 설비 품목이
   * 예사이므로 선택 인자로 둔다.
   */
  portsOf?: (typeKey: string) => readonly PortTemplate[] | undefined,
): AssemblyError | null {
  /* 하나씩 얹으며 본다 — 앞서 놓인 것들이 곧 그 다음 것의 점유다. */
  const placed: GridOccupant[] = [];
  for (const item of spec.items) {
    /* 빈 슬롯은 품목을 안 가리킨다 — 자리와 이름만 있는 것이 그 자리의 사실이다. */
    if (item.typeKey !== null && !typeKeys.has(item.typeKey)) return 'unknown-type';
    /* 이름과 포트 수도 **여기서** 본다 — 예전에는 서버의 요청 형식 검사(zod)에만 있었다.
       그래서 이름을 지운 채 저장하면 화면은 막지 않고 서버가 400 으로 거절했다: 사람은
       왜 튕겼는지 모른 채 저장 단추만 다시 눌렀다. 같은 규칙을 두 곳에 두면 반드시 갈린다. */
    if (item.name.trim() === '') return 'empty-name';
    for (const counts of [item.portCounts, item.portPositions]) {
      for (const n of Object.values(counts ?? {})) {
        if (!Number.isInteger(n) || n < 1) return 'bad-port-count';
      }
    }
    const at = placementAt(item);
    const issue = validateGridPlacement({ grid: ASSEMBLY_GRID, ...(at ?? { col: null, row: null, colSpan: 1, rowSpan: 1 }), occupants: placed });
    if (issue) return issue;
    placed.push({ assetId: item.id, ...at! });
  }
  return validateLinks(spec, portsOf);
}

/**
 * 내부 배선이 말이 되는가 — **판정은 케이블을 이을 때와 같은 함수가 한다.**
 *
 * 구성 항목의 포트를 실제로 펴서(`instantiatePorts`) `validateConnection` 에 그대로 넘긴다.
 * 여기서 규칙을 다시 쓰면 설비 품목에서는 이어지는데 놓고 나서 그 케이블이 규칙 위반이
 * 되는 조립을 만들 수 있다 — 전원 출력끼리 이어 둔 프리셋 같은 것.
 *
 * 하나씩 얹으며 본다 — 앞서 놓인 줄이 곧 그 다음 줄의 점유다(격자를 보는 방식과 같다).
 */
function validateLinks(
  spec: AssemblySpec,
  portsOf?: (typeKey: string) => readonly PortTemplate[] | undefined,
): AssemblyError | null {
  const links = spec.links ?? [];
  if (links.length === 0) return null;

  /* 항목마다 포트를 한 번만 편다 — 링크가 많아도 같은 항목을 되풀이해 펴지 않는다. */
  const portsByItem = new Map<string, Map<string, PortRef>>();
  for (const item of spec.items) {
    const templates = portsOf?.(item.typeKey);
    if (!templates) continue;
    const ports = instantiatePorts(templates, item.id, item.portCounts, item.portPositions);
    portsByItem.set(
      item.id,
      new Map(ports.map((p) => {
        const end = { itemId: item.id, group: p.group, index: p.index };
        return [`${p.group}:${p.index}`, { ...p, id: linkPortKey(end) }];
      })),
    );
  }

  const cableCount = new Map<string, number>();
  for (const link of links) {
    const ends = linkEnds(link);
    const ports = ends.map((e) => portsByItem.get(e.itemId)?.get(`${e.group}:${e.index}`));
    const [a, b] = ports;
    /* 없는 항목·없는 포트를 가리킨다 — 항목을 지웠는데 줄이 남았거나, 그 종류의 포트 수를
       줄여 번호가 사라진 경우다. */
    if (!a || !b) return 'link-endpoint';

    const issue = validateConnection(a, b, cableCount);
    if (issue === 'port-occupied') return 'link-occupied';
    if (issue) return 'link-invalid';

    for (const p of [a, b]) cableCount.set(p.id, (cableCount.get(p.id) ?? 0) + 1);
  }
  return null;
}

/* 설비 품목을 장비 묶음으로 펴는 일(`instantiateAssembly`)은 여기 있었지만 **쓰는 곳이
   없었다** — 화면은 DB 형상(자산 id·typeId·변전소)으로 펴야 해서 제 것을 따로 갖고
   있었다(`frontend/src/v2/placeAssembly.ts`). 살아 있는 규칙을 흉내 내는 죽은 코드는
   없느니만 못하다: 규칙을 고치러 온 사람이 여기를 고치고 반영됐다고 여긴다. 그래서 지웠다.
   서버가 펴야 할 일이 생기면 그때 **쓰는 곳과 함께** 되살린다. */

/**
 * 설비의 **도화지** — 모든 설비가 같은 판을 쓴다. **이 값이 격자의 유일한 출처다.**
 *
 * 한동안 화면만 이 상수를 쓰고 설비 품목마다 행·열 수를 따로 저장해 두었다(`Assembly.gridCols`).
 * 그래서 화면은 10×20 을 그리는데 서버는 4×6 으로 판정해, 눈으로 놓은 자리가 저장할 때
 * `배치할 수 없습니다: out-of-range` 로 튕겼다 — 사용자가 무엇이 잘못됐는지 알 길이 없는
 * 종류의 버그다. 같은 규칙을 두 곳에 두면 반드시 갈린다.
 *
 * 예전에는 설비 품목마다 행·열 수를 숫자로 받았다. 그런데 격자는 자산을 놓는 도화지일
 * 뿐이고, 그 설비가 어떤 물건인지는 **안에 무엇이 놓였는가**가 말한다 — 크기가 말하는 게
 * 아니다. 접지함체를 1×1 로 만들 이유가 없다: 판은 그대로 두고 장비를 크게 그리면 된다.
 *
 * 크기는 **패널 폭이 정한다**. 상세 패널 안쪽 폭은 327px 이라 10열이면 칸당 33px 이고,
 * 세로로 긴 장비(광단말·광스위치)은 세로쓰기로 이름이 온전히 보인다. 더 촘촘하게 하면
 * 세로 장비가 한 글자씩 접히고, 더 성기게 하면 지금 배치가 들어가지 않는다.
 */
export const ASSEMBLY_GRID = { cols: 10, rows: 20 } as const;

/**
 * 격자 칸을 사람 말로 — `5행 3열`.
 *
 * 예전에는 「자리 4」처럼 좌표를 번호 하나로 접어서 불렀다(`row × cols + col + 1`). 그런데
 * 그 번호는 **도화지 좌표에 이름을 붙인 것**일 뿐이라, 도화지가 촘촘해지면 번호만 커지고
 * 뜻이 없어진다(`자리 137`). 게다가 화면 밖에서는 문자열로 정렬돼 「자리 10」이 「자리 4」
 * 앞에 섰다.
 *
 * 좌표는 좌표로 말한다. 사람이 세는 방식이므로 1부터 센다.
 */
export function cellLabel(col: number, row: number): string {
  return `${row + 1}행 ${col + 1}열`;
}
