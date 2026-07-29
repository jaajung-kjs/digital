/**
 * v2 전용 axios 인스턴스
 *
 * - baseURL: /api
 * - localStorage 토큰 관리 (accessToken / refreshToken — 구 utils/api.ts 와 동일 키)
 * - 401 → /api/v2/auth/refresh 단일 비행(single-flight) 큐
 * - refresh 실패 → 토큰 삭제 + /login 리다이렉트
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

// ── 요청 인터셉터: Bearer 헤더 자동 첨부 ─────────────────────────────────────
httpClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = tokenStorage.getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ── 응답 인터셉터: 401 → refresh → 재시도 ────────────────────────────────────
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

httpClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status !== 401 || original._retry) {
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
        return httpClient(original);
      });
    }

    // ─ refresh 시작 ─
    original._retry = true;
    isRefreshing = true;

    const refreshToken = tokenStorage.getRefreshToken();
    if (!refreshToken) {
      tokenStorage.clearTokens();
      flushQueue(new Error('no_refresh_token'), null);
      isRefreshing = false;
      window.location.href = '/login';
      return Promise.reject(error);
    }

    try {
      const { data } = await axios.post<{ accessToken: string; refreshToken: string }>(
        '/api/v2/auth/refresh',
        { refreshToken },
      );

      tokenStorage.setAccessToken(data.accessToken);
      tokenStorage.setRefreshToken(data.refreshToken);

      flushQueue(null, data.accessToken);

      if (original.headers) original.headers.Authorization = `Bearer ${data.accessToken}`;
      return httpClient(original);
    } catch (refreshErr) {
      flushQueue(refreshErr, null);
      tokenStorage.clearTokens();
      window.location.href = '/login';
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  },
);
