import type { V2Asset, V2Cable } from '../../types';
import { cableCountByPortId } from '../../cableSelectors';
import { withDescendants } from '../../assetTree';
import { portHasRoom } from '@twin/core';

/**
 * 평면도의 **케이블 도구** — 상태 기계와 그 판정들.
 *
 * 도면 파일(1,800줄)에서 떼어 낸다. 이 도구가 아는 것은 「지금 무엇을 기다리는가」(자산 →
 * 포트 → 반대쪽)와 「어디를 누를 수 있는가」뿐이고, 캔버스가 어떻게 그려지는지는 모른다 —
 * 그러니 캔버스와 한 파일에 있을 이유가 없다. 순수한 값들이라 시험도 여기서 바로 친다.
 */

/** 케이블 포트 피커 상태 */
export interface PickerState {
  asset: V2Asset;
  /** viewport client 좌표 (fixed 팝오버용) */
  screenPos: { x: number; y: number };
  /** 첫 끝점이 이미 정해졌으면 그 포트 */
  firstPortId: string | null;
  /** 사전 연결 검증 에러 (한글) — 있으면 스테이지 대신 안내 표시 */
  validationError?: string | null;
}

// ── 케이블 도구 FSM ───────────────────────────────────────────────────────────
// 상태: idle(armed=false) → armed(자산 클릭 대기) → picker 열림(포트 대기)
//       → 첫 끝점 확정(armed 유지, 두 번째 자산 대기) → 스테이지 완료(armed 유지, 연속 연결)
//       원격(대국) 경로는 picker 대신 remoteModalOpen 을 통해 같은 firstEndpoint 를 소비한다.
export interface CableToolState {
  armed: boolean;
  categoryId: string;
  picker: PickerState | null;
  /**
   * 첫 끝점 — **포트 하나뿐**이다.
   *
   * 예전에는 포트와 함께 자산 id 도 들고 있었는데, **두 진입점이 서로 다른 자산을 넣었다**:
   * 도면에서 시작하면 놓인 설비(OFD)가, 포트 탭의 「케이블 연결」로 시작하면 그 포트를 가진
   * 장비(슬롯)가 들어갔다. 도면은 놓인 설비로만 그림을 그리므로, 뒤쪽 길로 시작하면 첫 끝점
   * 강조도 경로 미리보기도 **아무것도 안 나왔다** — 같은 일인데 들어온 문에 따라 달랐다.
   *
   * 무엇에 매달린 포트인지는 자료가 이미 안다(포트 → 장비 → 놓인 조상). 들고 다니지 않는다.
   */
  firstPortId: string | null;
  /**
   * 지금 그리고 있는 **경로의 꺾은점** — 첫 끝점이 정해진 뒤 도면을 누른 자리들.
   *
   * 예전에는 이을 곳 둘만 고르면 케이블이 그 사이를 곧게 질렀다. 실제 도면에서 케이블은
   * 벽을 타고 트레이를 따라 돈다 — 곧은 선은 「어디로 가는 케이블인지」를 지운다. 나중에
   * 골라서 꺾을 수는 있었지만(경로점 편집), 그리는 김에 그리는 것이 자연스럽다.
   */
  draftPath: { x: number; y: number }[];
  selectedCableId: string | null;
  remoteModalOpen: boolean;
  remoteError: string | null;
}

export const initialCableToolState: CableToolState = {
  armed: false,
  categoryId: '',
  picker: null,
  firstPortId: null,
  draftPath: [],
  selectedCableId: null,
  remoteModalOpen: false,
  remoteError: null,
};

export type CableToolAction =
  | { type: 'ARM' }
  | { type: 'DISARM' }
  | { type: 'SET_CATEGORY'; categoryId: string }
  | { type: 'OPEN_PICKER'; picker: PickerState }
  | { type: 'CLOSE_PICKER' }
  | { type: 'SET_PICKER_ERROR'; error: string }
  | { type: 'CONFIRM_FIRST_ENDPOINT'; portId: string }
  | { type: 'ADD_WAYPOINT'; point: { x: number; y: number } }
  | { type: 'UNDO_WAYPOINT' }
  | { type: 'ABORT_TO_ARMED' }
  | { type: 'CABLE_STAGED' }
  | { type: 'OPEN_REMOTE_MODAL' }
  | { type: 'CLOSE_REMOTE_MODAL' }
  | { type: 'SET_REMOTE_ERROR'; error: string | null }
  | { type: 'REMOTE_CABLE_STAGED' }
  | { type: 'SELECT_CABLE'; id: string }
  | { type: 'DESELECT_CABLE' };

export function cableToolReducer(state: CableToolState, action: CableToolAction): CableToolState {
  switch (action.type) {
    case 'ARM':
      return { ...state, armed: true, firstPortId: null, picker: null, draftPath: [] };
    case 'DISARM':
      return !state.armed && state.picker === null && state.firstPortId === null
        ? state
        : { ...state, armed: false, firstPortId: null, picker: null, draftPath: [] };
    case 'SET_CATEGORY':
      return state.categoryId === action.categoryId ? state : { ...state, categoryId: action.categoryId };
    case 'OPEN_PICKER':
      return { ...state, picker: action.picker };
    case 'CLOSE_PICKER':
      return state.picker === null ? state : { ...state, picker: null };
    case 'SET_PICKER_ERROR':
      return state.picker ? { ...state, picker: { ...state.picker, validationError: action.error } } : state;
    case 'CONFIRM_FIRST_ENDPOINT':
      /* 첫 끝점이 정해지는 순간부터 경로를 그린다 — 지난 손짓의 꺾은점은 남기지 않는다. */
      return { ...state, firstPortId: action.portId, picker: null, draftPath: [] };
    case 'ADD_WAYPOINT':
      /* 첫 끝점 없이는 그릴 경로가 없다(어디서 시작하는지 모른다). */
      return state.firstPortId ? { ...state, draftPath: [...state.draftPath, action.point] } : state;
    case 'UNDO_WAYPOINT':
      return state.draftPath.length === 0 ? state : { ...state, draftPath: state.draftPath.slice(0, -1) };
    case 'ABORT_TO_ARMED':
      // 첫 끝점 포트를 effective 자산에서 못 찾은 경우 — 무검증 스테이지 금지, armed 는 유지
      return { ...state, firstPortId: null, picker: null, draftPath: [] };
    case 'CABLE_STAGED':
      // 도구 유지(연속 연결), 첫 끝점과 그리던 경로만 초기화
      return { ...state, firstPortId: null, picker: null, draftPath: [] };
    case 'OPEN_REMOTE_MODAL':
      return { ...state, remoteModalOpen: true, remoteError: null };
    case 'CLOSE_REMOTE_MODAL':
      return { ...state, remoteModalOpen: false, remoteError: null };
    case 'SET_REMOTE_ERROR':
      return { ...state, remoteError: action.error };
    case 'REMOTE_CABLE_STAGED':
      return { ...state, firstPortId: null, remoteModalOpen: false, picker: null, remoteError: null, draftPath: [] };
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
  /** 고른 케이블 품목의 매체 — 없으면 가리지 않는다. */
  mediumKey: string | undefined;
  /** 이미 정해진 첫 끝점 — 자기 자신에게는 잇지 않는다. */
  firstPortId: string | undefined;
}): Set<string> {
  const counts = cableCountByPortId(args.cables as V2Cable[]);
  const usable = (a: V2Asset) =>
    a.ports.some(
      (p) =>
        (args.mediumKey == null || p.medium === args.mediumKey) &&
        p.id !== args.firstPortId &&
        portHasRoom(p.medium, counts.get(p.id) ?? 0),
    );
  const ids = new Set<string>();
  for (const placed of args.placed) {
    if (withDescendants(args.assets, placed.id).some(usable)) ids.add(placed.id);
  }
  return ids;
}
