import type { V2Asset, V2Cable } from '../../types';
import { cableCountByPortId } from '../../cableSelectors';
import { withDescendants } from '../../assetTree';
import { portHasRoom, portKind } from '@twin/core';

/**
 * 평면도의 **케이블 도구** — 상태 기계와 그 판정들.
 *
 * 도면 파일(1,800줄)에서 떼어 낸다. 이 도구가 아는 것은 「지금 무엇을 기다리는가」(자산 →
 * 포트 → 반대쪽)와 「어디를 누를 수 있는가」뿐이고, 캔버스가 어떻게 그려지는지는 모른다 —
 * 그러니 캔버스와 한 파일에 있을 이유가 없다. 순수한 값들이라 시험도 여기서 바로 친다.
 */

/**
 * 평면도에 남는 케이블 상태 — **고른 가닥 하나**.
 *
 * 「지금 무엇을 잇는 중인가」는 **연결 세션**(`connectSession.ts`)이 들고, 머리줄 아래
 * 오버레이가 그것을 화면에 적는다. 여기 있던 `armed`·`categoryId`·`firstPortId`·`draftPath`
 * ·`remoteModalOpen`·`remoteError` 는 같은 사실을 페이지의 `cableStartPortId`·`cablePick` 과
 * **두 곳에서** 들고 있었고, 그래서 진입점에 따라 첫 끝점 강조가 나왔다 안 나왔다 했다.
 *
 * 도면이 여전히 알아야 하는 것은 하나다: **어느 가닥을 골랐나**(경로점을 편집하려면 필요하다).
 */
export interface CableToolState {
  selectedCableId: string | null;
}

export const initialCableToolState: CableToolState = { selectedCableId: null };

export type CableToolAction =
  | { type: 'SELECT_CABLE'; id: string }
  | { type: 'DESELECT_CABLE' };

export function cableToolReducer(state: CableToolState, action: CableToolAction): CableToolState {
  switch (action.type) {
    case 'SELECT_CABLE':
      return { ...state, selectedCableId: action.id };
    case 'DESELECT_CABLE':
      return state.selectedCableId === null ? state : { ...state, selectedCableId: null };
    default:
      return state;
  }
}

/**
 * 못 잇는 까닭을 사람 말로 — 코드는 core 의 판정(`validateConnection`)이 준다.
 */
export function connectErrorLabel(code: string): string {
  if (code === 'same-port') return '같은 포트';
  if (code === 'port-occupied') return '이미 연결됨';
  if (code === 'medium-mismatch') return '매체 불일치';
  if (code === 'direction-mismatch') return '같은 방향끼리 연결할 수 없음';
  // 24심 성단을 1심 어댑터에 물릴 수는 없다 — 왜 안 되는지까지 적는다.
  if (code === 'core-count-mismatch') return '심선 수가 다름 (다심은 다심끼리)';
  return code;
}

/**
 * 지금 **이을 수 있는 설비**의 id — 도면이 이것만 또렷하게 그린다.
 *
 * 매체가 맞고 자리가 남은 포트를 하나라도 가진 것만(안에 든 장비의 포트까지 센다).
 * 예전에는 아무 설비나 눌렸고, 접지함체를 눌러 놓고 나서야 빈 판을 보고 되돌아왔다.
 *
 * **저장 여부는 보지 않는다.** 방금 놓은 설비도 포트를 갖고(화면이 만든다) 그 id 그대로
 * 저장되므로, 저장은 잇기의 전제가 아니다 — 한때 그 조건이 있어 케이블이 막혔다.
 */
export function connectableAssetIds(args: {
  assets: readonly V2Asset[];
  /** 도면에 놓인 것들 — 누를 수 있는 것은 이 중 하나다(id 만 있으면 된다). */
  placed: readonly { id: string }[];
  cables: readonly V2Cable[];
  /**
   * **출발 포트의 매체** — 여기서 `connectsTo` 를 펴 도착 후보를 거른다.
   *
   * 예전에는 **케이블 품목의 매체**로 걸렀다. 종류를 나중에 고르게 되면서 그 값이 없어졌고,
   * 애초에 기준이 틀렸다: 짝을 정하는 것은 어휘이지 케이블이 아니다(`portKind.connectsTo`).
   * 출발이 없으면(출발을 고르는 중) 가리지 않는다.
   */
  fromPortMedium: string | undefined;
  /** 이미 정해진 첫 끝점 — 자기 자신에게는 잇지 않는다. */
  firstPortId: string | undefined;
}): Set<string> {
  const counts = cableCountByPortId(args.cables as V2Cable[]);
  const kind = args.fromPortMedium ? portKind(args.fromPortMedium) : null;
  /* 어휘에 없는 매체는 예전 규칙(같은 매체끼리)으로 둔다 — 자료가 앞서 나가도 잠기지 않게.
     `validateConnection` 이 쓰는 것과 같은 물러섬이다. */
  const accepts = (m: string) =>
    args.fromPortMedium == null ? true
    : kind ? kind.connectsTo.includes(m)
    : m === args.fromPortMedium;
  const usable = (a: V2Asset) =>
    a.ports.some((p) => accepts(p.medium) && p.id !== args.firstPortId && portHasRoom(p.medium, counts.get(p.id) ?? 0));
  const ids = new Set<string>();
  for (const placed of args.placed) {
    if (withDescendants(args.assets, placed.id).some(usable)) ids.add(placed.id);
  }
  return ids;
}
