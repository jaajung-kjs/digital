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
   * 도착 후보를 거르는 기준.
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
 * 세션이 아는 것은 둘뿐이다: **어디서 출발했나**, **끝나면 어디로 돌아가나**. 세션은
 * 「포트를 고를 때까지」만 살고, 고르는 순간 종류를 묻는 상자로 넘긴다.
 *
 * **종류는 여기 없다.** 한때 오버레이에서 미리 고르게 했는데, 고르지 않은 채 포트를 누르면
 * 「종류를 고르세요」로 튕겨 **고른 포트가 버려졌다** — 무엇을 잘못했는지도 도면 위에서는
 * 알기 어려웠다. 이제 포트를 고르면 그때 묻는다(`ConnectCategoryDialog`) 즉, 물을 시점이
 * 정해져 있어 세션이 그 값을 들고 있을 이유가 없다.
 *
 * **「이어서 또 잇기」도 없다.** 한 번에 한 가닥이고, 이으면 시작한 화면으로 돌아간다.
 *
 * 담아 둔 워킹카피는 여기 두지 않는다 — 그것은 **워킹카피 상태**이므로 스토어가 주인이고,
 * 그래야 `dirtyCount()` 가 보류분을 함께 센다. 덤으로 「읽기 전용 = 보류 중」이라는 파생
 * 사실 하나로 끝나 어긋날 깃발이 생기지 않는다.
 */
export interface ConnectSession {
  /** `null` 이면 **출발**을 고르는 중, 있으면 **도착**을 고르는 중. */
  from: ConnectFrom | null;
  origin: ConnectOrigin;
}

export function openSession(origin: ConnectOrigin): ConnectSession {
  return { from: null, origin };
}

/** 출발이 정해졌다 — 이제 도착 포트를 고를 때까지 세션이 산다. */
export function withFrom(s: ConnectSession, from: ConnectFrom): ConnectSession {
  return { ...s, from };
}

/**
 * 고른 두 끝점 — **종류를 묻는 중**.
 *
 * 세션과 따로 둔다: 세션은 「고르는 중」이고 이것은 「골랐고 확인받는 중」이다. 상자를
 * 접으면 이 값만 사라져 **세션은 그대로 살아 있다**(고른 포트만 버리고 다시 고른다).
 */
export interface PendingConnect {
  from: ConnectFrom;
  toPortId: string;
  /** 상자에 적는 도착 이름 — 무엇에 이으려는지 글자로 확인한다. */
  toLabel: string;
}
