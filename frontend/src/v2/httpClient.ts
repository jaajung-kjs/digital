/**
 * v2 전용 axios 인스턴스
 *
 * - baseURL: /api
 * - localStorage 토큰 관리 (accessToken / refreshToken — 구 utils/api.ts 와 동일 키)
 * - 401 → /api/v2/auth/refresh 단일 비행(single-flight) 큐
 * - refresh 실패 → 토큰 삭제 + /login 리다이렉트
 *
 * 인터셉터 핸들러는 의존성 주입 팩토리(createRequestOnFulfilled /
 * createResponseOnRejected)로 만들어 실제 등록에 사용한다 — 테스트가
 * 프로덕션과 동일한 코드를 import 해 검증할 수 있게 하기 위함.
 */
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

export const httpClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// ── 토큰 스토리지 ─────────────────────────────────────────────────────────────
const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';

export const tokenStorage = {
  getAccessToken: () => localStorage.getItem(ACCESS_KEY),
  setAccessToken: (token: string) => localStorage.setItem(ACCESS_KEY, token),
  getRefreshToken: () => localStorage.getItem(REFRESH_KEY),
  setRefreshToken: (token: string) => localStorage.setItem(REFRESH_KEY, token),
  clearTokens: () => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

type TokenStorageLike = typeof tokenStorage;

// ── 요청 인터셉터 팩토리: Bearer 헤더 자동 첨부 ──────────────────────────────
export function createRequestOnFulfilled(storage: TokenStorageLike) {
  return (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    const token = storage.getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  };
}

// ── 응답 인터셉터 팩토리: 401 → refresh → 재시도 (single-flight) ─────────────
export interface ResponseInterceptorDeps {
  storage: TokenStorageLike;
  /** 원래 요청 재시도 (프로덕션: httpClient(config)) */
  retry: (config: InternalAxiosRequestConfig) => Promise<unknown>;
  /** refresh 호출 (프로덕션: httpClient.post('/v2/auth/refresh', ...)) */
  postRefresh: (refreshToken: string) => Promise<{ accessToken: string; refreshToken: string }>;
  /** refresh 실패 시 리다이렉트 (프로덕션: window.location.href = '/login') */
  redirectToLogin: () => void;
}

export function createResponseOnRejected(deps: ResponseInterceptorDeps) {
  let isRefreshing = false;
  let failedQueue: Array<{
    resolve: (token: string) => void;
    reject: (err: unknown) => void;
  }> = [];

  const flushQueue = (err: unknown, token: string | null) => {
    for (const p of failedQueue) {
      if (err) p.reject(err);
      else p.resolve(token!);
    }
    failedQueue = [];
  };

  return async (error: AxiosError): Promise<unknown> => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;

    if (error.response?.status !== 401 || !original || original._retry) {
      return Promise.reject(error);
    }

    // 인증 자체 엔드포인트(로그인·refresh)는 재시도하지 않음
    const url = original.url ?? '';
    if (url.includes('/auth/login') || url.includes('/auth/refresh')) {
      return Promise.reject(error);
    }

    // ─ 이미 refresh 중이면 큐에 합류 ─
    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((newToken) => {
        if (original.headers) original.headers.Authorization = `Bearer ${newToken}`;
        original._retry = true;
        return deps.retry(original);
      });
    }

    // ─ refresh 시작 ─
    original._retry = true;
    isRefreshing = true;

    const refreshToken = deps.storage.getRefreshToken();
    if (!refreshToken) {
      deps.storage.clearTokens();
      flushQueue(error, null);
      isRefreshing = false;
      deps.redirectToLogin();
      return Promise.reject(error);
    }

    try {
      const tokens = await deps.postRefresh(refreshToken);

      deps.storage.setAccessToken(tokens.accessToken);
      deps.storage.setRefreshToken(tokens.refreshToken);

      flushQueue(null, tokens.accessToken);

      if (original.headers) original.headers.Authorization = `Bearer ${tokens.accessToken}`;
      return deps.retry(original);
    } catch (refreshErr) {
      flushQueue(refreshErr, null);
      deps.storage.clearTokens();
      deps.redirectToLogin();
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  };
}

// ── 프로덕션 등록 ─────────────────────────────────────────────────────────────
httpClient.interceptors.request.use(createRequestOnFulfilled(tokenStorage), (error) =>
  Promise.reject(error),
);

httpClient.interceptors.response.use(
  (res) => res,
  createResponseOnRejected({
    storage: tokenStorage,
    retry: (config) => httpClient(config),
    postRefresh: async (refreshToken) => {
      // httpClient 인스턴스 사용(baseURL 공유) — 이 요청이 401이어도
      // 위 onRejected 의 '/auth/refresh' URL 가드가 재귀를 차단한다.
      const { data } = await httpClient.post<{ accessToken: string; refreshToken: string }>(
        '/v2/auth/refresh',
        { refreshToken },
      );
      return data;
    },
    redirectToLogin: () => {
      window.location.href = '/login';
    },
  }),
);
