import { MutationCache, QueryClient } from '@tanstack/react-query';

// ── mutation 실패 핸들러 주입 지점 ────────────────────────────────────────────
// 조직·카탈로그의 모든 변경은 react-query mutation 이다. 각 mutation 에 onError 를
// 다는 대신(12곳으로 흩어진다) MutationCache 한 곳에서 받는다.
// lib/ 은 v2/ 를 import 하지 않는다(계층 유지) — 그래서 문구 번역은 주입받는다.
// httpClient 의 setSessionInvalidHandler 와 같은 관례다.
let mutationErrorHandler: ((error: unknown) => void) | null = null;

/** 전역 mutation 실패 핸들러 등록/해제. v2 부트에서 1회 호출. */
export function setMutationErrorHandler(fn: ((error: unknown) => void) | null): void {
  mutationErrorHandler = fn;
}

/**
 * 글로벌 react-query client — App.tsx 가 Provider 로 주입.
 * Non-React 코드 (zustand store action 등) 도 cache 에 접근하려면
 * 이 singleton 을 import 해서 `queryClient.getQueryData` / `ensureQueryData` 사용.
 */
export const queryClient = new QueryClient({
  // 개별 mutation 이 자기 onError 를 갖더라도 이 캐시 핸들러는 항상 함께 불린다 —
  // 실패가 조용히 사라지는 경로를 남기지 않는다.
  mutationCache: new MutationCache({
    onError: (error) => mutationErrorHandler?.(error),
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
