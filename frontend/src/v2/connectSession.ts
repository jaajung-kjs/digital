import type { ViewMode } from './useWorkspaceRoute';

/** 출발 끝점 — 이 값이 있으면 「도착을 고르는 중」이다. */
export interface ConnectFrom {
  portId: string;
  /** 오버레이에 적는 이름(`OFD · 슬롯 1 · 광 1`). 짓는 일은 부르는 쪽이 한다. */
  label: string;
  /**
   * 어느 국의 포트인가.
   *
   * **케이블은 이 국의 것이 된다.** 예전에는 `stageCableCreate` 가 그때 로드된 국에 쌓여,
   * A 에서 시작해 B 에서 고르면 케이블이 B 의 것이 되었다 — 시작한 쪽이 주인이어야 맞다.
   */
  substationId: string;
  /**
   * 종류 목록과 도착 후보를 거르는 기준.
   *
   * 「같은 매체」가 아니라 `portKind(medium).connectsTo` 의 기준점이다 — 짝을 정하는 것은
   * 어휘이지 케이블이 아니다(`validation/connection.ts:38-41`).
   */
  medium: string;
}

/**
 * 끝나면 **돌아갈 자리** — 시작한 화면 그대로.
 *
 * 평면도에서 시작했으면 평면도로, 계통에서 시작했으면 계통으로 돌아온다. 이을 곳을 고르러
 * 다른 층·다른 국을 다녀왔든 상관없다.
 */
export interface ConnectOrigin {
  substationId: string;
  view: ViewMode;
  /** 평면도에서 시작했을 때의 층. 다른 판에서 시작했으면 `null`. */
  floorId: string | null;
}

/**
 * **지금 케이블을 잇는 중이라는 사실 하나.** 이 값이 있으면 오버레이가 뜬다.
 *
 * 예전에는 이 사실이 세 곳에 흩어져 있었다: 도면의 `armed`·`firstPortId`, 페이지의
 * `cableStartPortId`, 그리고 `cablePick`. 셋이 같은 일을 가리켰고, 그래서 진입점에 따라
 * 첫 끝점 강조가 나왔다 안 나왔다 했다.
 *
 * 담아 둔 워킹카피는 여기 두지 않는다 — 그것은 **워킹카피 상태**이므로 스토어가 주인이고,
 * 그래야 `dirtyCount()` 가 보류분을 함께 센다(스펙 ⑦). 덤으로 「읽기 전용 = 보류 중」이라는
 * 파생 사실 하나로 끝나 어긋날 깃발이 생기지 않는다.
 */
export interface ConnectSession {
  /** `null` 이면 **출발**을 고르는 중, 있으면 **도착**을 고르는 중. */
  from: ConnectFrom | null;
  categoryId: string | null;
  origin: ConnectOrigin;
  /** 한 번 이은 뒤에도 세션을 살려 둔다 — 출발만 비운다. */
  keepGoing: boolean;
}

export function openSession(origin: ConnectOrigin): ConnectSession {
  return { from: null, categoryId: null, origin, keepGoing: false };
}

/**
 * 출발이 정해졌다 — 종류는 **그 매체에 직전에 쓴 것**이 물려 온다.
 *
 * 예전에는 그 매체 그룹의 첫 품목을 말없이 집었다(`FloorPlanView.tsx:483`). 물려 오는 값은
 * 오버레이에 고른 채로 보이므로 숨은 값이 아니고, 그 매체를 처음 쓰면 **비어 있다** —
 * 짐작해 채우지 않는다.
 */
export function withFrom(
  s: ConnectSession,
  from: ConnectFrom,
  lastByMedium: Readonly<Record<string, string>>,
): ConnectSession {
  return { ...s, from, categoryId: lastByMedium[from.medium] ?? null };
}

export function setCategory(s: ConnectSession, categoryId: string | null): ConnectSession {
  return s.categoryId === categoryId ? s : { ...s, categoryId };
}

export function setKeepGoing(s: ConnectSession, on: boolean): ConnectSession {
  return s.keepGoing === on ? s : { ...s, keepGoing: on };
}

/** 둘이 다 차야 이어진다 — 종류가 비면 못 잇는다. */
export function canConnect(s: ConnectSession): boolean {
  return s.from != null && s.categoryId != null;
}

/** 이은 뒤 — 이어서 또 이을 생각이면 **출발만** 비우고, 아니면 세션이 끝난다(`null`). */
export function finish(s: ConnectSession): ConnectSession | null {
  return s.keepGoing ? { ...s, from: null } : null;
}
