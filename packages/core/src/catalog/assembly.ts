import type { AssetTypeSpec, PortRef } from './types.js';
import { instantiatePorts } from './instantiatePorts.js';
import { placementAt, validateGridPlacement, type GridOccupant } from '../validation/gridPlacement.js';

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
}

/** 설비 품목의 격자에 놓인 장비 하나 — 어느 타입을, 격자의 어느 자리에. */
export interface AssemblyItemSpec {
  /** 설비 품목 안에서 유일한 식별자. */
  id: string;
  typeKey: string;
  name: string;
  col: number | null;
  row: number | null;
  colSpan: number | null;
  rowSpan: number | null;
  portCounts?: Record<string, number>;
  portPositions?: Record<string, number>;
}

export type AssemblyError = 'unknown-type' | 'out-of-range' | 'overlap' | 'empty-name' | 'bad-port-count';

/**
 * 설비 품목이 말이 되는가. null = 유효.
 *
 * 저장 전에 여기서 걸러야 배치할 때 터지지 않는다 — 설비 품목에서는 놓였는데 실제 배치에서
 * 튕기면 짠 사람이 무엇이 잘못됐는지 알 길이 없다.
 */
export function validateAssembly(
  spec: AssemblySpec,
  typeKeys: ReadonlySet<string>,
): AssemblyError | null {
  /* 하나씩 얹으며 본다 — 앞서 놓인 것들이 곧 그 다음 것의 점유다. */
  const placed: GridOccupant[] = [];
  for (const item of spec.items) {
    if (!typeKeys.has(item.typeKey)) return 'unknown-type';
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
