import { QueryClient } from '@tanstack/react-query';

/** 비교적 안정적인 조회(자산/층/슬림목록 등)의 공통 캐시 신선도(ms) — 흩어진 30초 TTL 의 단일 소스. */
export const QUERY_STALE_MS = 30_000;

/**
 * 글로벌 react-query client — App.tsx 가 Provider 로 주입.
 * Non-React 코드 (zustand store action 등) 도 cache 에 접근하려면
 * 이 singleton 을 import 해서 `queryClient.getQueryData` / `ensureQueryData` 사용.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
