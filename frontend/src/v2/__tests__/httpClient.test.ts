/**
 * httpClient 인터셉터 테스트 — 실제 프로덕션 코드 검증
 *
 * httpClient.ts 가 export 하는 createRequestOnFulfilled / createResponseOnRejected
 * (프로덕션 등록에 사용되는 바로 그 팩토리)를 import 해, 의존성만 주입(mock)하여
 * 실제 인터셉터 로직을 구동한다. 로직이 회귀하면 테스트가 깨진다.
 *
 * 커버:
 *   - tokenStorage CRUD
 *   - 요청 인터셉터: Bearer 헤더 첨부/미첨부
 *   - 401 → refresh → 재시도 1회 (새 토큰 저장 + Authorization 갱신)
 *   - 재시도 요청(_retry)의 401 → 그대로 reject (2차 refresh 없음)
 *   - refresh 실패 → 토큰 삭제 + /login 리다이렉트 + 대기 큐 전부 reject
 *   - refresh 토큰 없음 → 즉시 토큰 삭제 + 리다이렉트
 *   - /auth/login·/auth/refresh 401 → refresh 시도 없이 전파
 *   - 동시 401 단일 비행: refresh 1회, 전원 재시도
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AxiosError, InternalAxiosRequestConfig } from 'axios';
import {
  tokenStorage,
  createRequestOnFulfilled,
  createResponseOnRejected,
  type ResponseInterceptorDeps,
} from '../httpClient';

beforeEach(() => {
  localStorage.clear();
});

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────
type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

function make401(url: string, retry = false): AxiosError {
  const config = {
    url,
    headers: {} as Record<string, string>,
    _retry: retry || undefined,
  } as unknown as RetriableConfig;
  const err = new AxiosError(`401 ${url}`);
  err.config = config;
  err.response = {
    status: 401,
    statusText: 'Unauthorized',
    data: {},
    headers: {},
    config,
  } as never;
  return err;
}

function makeDeps(overrides: Partial<ResponseInterceptorDeps> = {}) {
  const deps: ResponseInterceptorDeps = {
    storage: tokenStorage,
    retry: vi.fn(async (config: RetriableConfig) => ({
      data: { ok: true },
      config,
    })) as ResponseInterceptorDeps['retry'],
    postRefresh: vi.fn(async () => ({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    })) as unknown as ResponseInterceptorDeps['postRefresh'],
    redirectToLogin: vi.fn(),
    ...overrides,
  };
  return {
    deps,
    retry: deps.retry as ReturnType<typeof vi.fn>,
    postRefresh: deps.postRefresh as unknown as ReturnType<typeof vi.fn>,
    redirectToLogin: deps.redirectToLogin as ReturnType<typeof vi.fn>,
  };
}

// ── tokenStorage ─────────────────────────────────────────────────────────────
describe('tokenStorage', () => {
  it('accessToken 저장/조회/삭제', () => {
    expect(tokenStorage.getAccessToken()).toBeNull();
    tokenStorage.setAccessToken('tok-a');
    expect(tokenStorage.getAccessToken()).toBe('tok-a');
    tokenStorage.clearTokens();
    expect(tokenStorage.getAccessToken()).toBeNull();
  });

  it('refreshToken 저장/조회/삭제', () => {
    tokenStorage.setRefreshToken('tok-r');
    expect(tokenStorage.getRefreshToken()).toBe('tok-r');
    tokenStorage.clearTokens();
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });
});

// ── 요청 인터셉터 (실제 팩토리) ──────────────────────────────────────────────
describe('createRequestOnFulfilled — Bearer 헤더', () => {
  it('accessToken 있으면 Authorization 헤더 첨부', () => {
    tokenStorage.setAccessToken('access-abc');
    const onFulfilled = createRequestOnFulfilled(tokenStorage);
    const config = { headers: {} as Record<string, string> } as unknown as InternalAxiosRequestConfig;
    const result = onFulfilled(config);
    expect((result.headers as Record<string, string>).Authorization).toBe('Bearer access-abc');
  });

  it('accessToken 없으면 Authorization 헤더 없음', () => {
    const onFulfilled = createRequestOnFulfilled(tokenStorage);
    const config = { headers: {} as Record<string, string> } as unknown as InternalAxiosRequestConfig;
    const result = onFulfilled(config);
    expect((result.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

// ── 응답 인터셉터 (실제 팩토리) ──────────────────────────────────────────────
describe('createResponseOnRejected — 401 refresh 흐름', () => {
  it('401 → refresh → 새 토큰 저장 + Authorization 갱신 + 재시도 1회', async () => {
    tokenStorage.setRefreshToken('old-refresh');
    const { deps, retry, postRefresh, redirectToLogin } = makeDeps();
    const onRejected = createResponseOnRejected(deps);

    const err = make401('/v2/data');
    const result = (await onRejected(err)) as { data: { ok: boolean }; config: RetriableConfig };

    expect(postRefresh).toHaveBeenCalledTimes(1);
    expect(postRefresh).toHaveBeenCalledWith('old-refresh');
    expect(tokenStorage.getAccessToken()).toBe('new-access');
    expect(tokenStorage.getRefreshToken()).toBe('new-refresh');
    expect(retry).toHaveBeenCalledTimes(1);
    // 재시도 config 에 새 토큰 헤더 + _retry 마킹
    const retriedConfig = retry.mock.calls[0][0] as RetriableConfig;
    expect((retriedConfig.headers as Record<string, string>).Authorization).toBe('Bearer new-access');
    expect(retriedConfig._retry).toBe(true);
    expect(result.data.ok).toBe(true);
    expect(redirectToLogin).not.toHaveBeenCalled();
  });

  it('재시도 요청(_retry=true)의 401 → 그대로 reject, 2차 refresh 없음', async () => {
    tokenStorage.setRefreshToken('old-refresh');
    const { deps, postRefresh } = makeDeps();
    const onRejected = createResponseOnRejected(deps);

    const err = make401('/v2/data', true); // _retry 이미 설정
    await expect(onRejected(err)).rejects.toBe(err);
    expect(postRefresh).not.toHaveBeenCalled();
  });

  it('refresh 실패 → 토큰 삭제 + redirectToLogin', async () => {
    tokenStorage.setAccessToken('old-access');
    tokenStorage.setRefreshToken('old-refresh');
    const refreshErr = new Error('INVALID_REFRESH');
    const { deps, retry, redirectToLogin } = makeDeps({
      postRefresh: vi.fn().mockRejectedValue(refreshErr) as unknown as ResponseInterceptorDeps['postRefresh'],
    });
    const onRejected = createResponseOnRejected(deps);

    await expect(onRejected(make401('/v2/data'))).rejects.toBe(refreshErr);

    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
    expect(redirectToLogin).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
  });

  it('refresh 토큰 없음 → 즉시 토큰 삭제 + redirectToLogin, refresh 미호출', async () => {
    tokenStorage.setAccessToken('old-access');
    // refreshToken 없음
    const { deps, postRefresh, redirectToLogin } = makeDeps();
    const onRejected = createResponseOnRejected(deps);

    const err = make401('/v2/data');
    await expect(onRejected(err)).rejects.toBe(err);

    expect(postRefresh).not.toHaveBeenCalled();
    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(redirectToLogin).toHaveBeenCalledTimes(1);
  });

  it('/auth/login 401 → refresh 시도 없이 그대로 전파', async () => {
    tokenStorage.setRefreshToken('old-refresh');
    const { deps, postRefresh } = makeDeps();
    const onRejected = createResponseOnRejected(deps);

    const err = make401('/v2/auth/login');
    await expect(onRejected(err)).rejects.toBe(err);
    expect(postRefresh).not.toHaveBeenCalled();
  });

  it('/auth/refresh 401 → refresh 시도 없이 그대로 전파 (재귀 차단)', async () => {
    tokenStorage.setRefreshToken('old-refresh');
    const { deps, postRefresh } = makeDeps();
    const onRejected = createResponseOnRejected(deps);

    const err = make401('/v2/auth/refresh');
    await expect(onRejected(err)).rejects.toBe(err);
    expect(postRefresh).not.toHaveBeenCalled();
  });
});

describe('createResponseOnRejected — 동시 401 단일 비행', () => {
  it('동시 3개 401 → refresh 1회, 전원 새 토큰으로 재시도', async () => {
    tokenStorage.setRefreshToken('old-refresh');

    // postRefresh 를 수동 resolve 하여 3개가 모두 in-flight 상태로 진입하게 함
    let resolveRefresh!: (v: { accessToken: string; refreshToken: string }) => void;
    const refreshPromise = new Promise<{ accessToken: string; refreshToken: string }>((res) => {
      resolveRefresh = res;
    });
    const postRefresh = vi.fn(() => refreshPromise);
    const { deps, retry } = makeDeps({
      postRefresh: postRefresh as unknown as ResponseInterceptorDeps['postRefresh'],
    });
    const onRejected = createResponseOnRejected(deps);

    const p1 = onRejected(make401('/v2/a'));
    const p2 = onRejected(make401('/v2/b'));
    const p3 = onRejected(make401('/v2/c'));

    // refresh 완료
    resolveRefresh({ accessToken: 'new-access', refreshToken: 'new-refresh' });
    await Promise.all([p1, p2, p3]);

    expect(postRefresh).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledTimes(3);
    // 3개 모두 새 토큰 헤더로 재시도 + _retry 마킹
    for (const call of retry.mock.calls) {
      const cfg = call[0] as RetriableConfig;
      expect((cfg.headers as Record<string, string>).Authorization).toBe('Bearer new-access');
      expect(cfg._retry).toBe(true);
    }
    expect(tokenStorage.getAccessToken()).toBe('new-access');
    expect(tokenStorage.getRefreshToken()).toBe('new-refresh');
  });

  it('refresh 실패 시 대기 큐 전부 reject + 토큰 삭제 + 리다이렉트 1회', async () => {
    tokenStorage.setRefreshToken('old-refresh');

    let rejectRefresh!: (e: Error) => void;
    const refreshPromise = new Promise<{ accessToken: string; refreshToken: string }>((_res, rej) => {
      rejectRefresh = rej;
    });
    const postRefresh = vi.fn(() => refreshPromise);
    const { deps, retry, redirectToLogin } = makeDeps({
      postRefresh: postRefresh as unknown as ResponseInterceptorDeps['postRefresh'],
    });
    const onRejected = createResponseOnRejected(deps);

    const p1 = onRejected(make401('/v2/a'));
    const p2 = onRejected(make401('/v2/b'));
    const p3 = onRejected(make401('/v2/c'));

    const refreshErr = new Error('refresh_failed');
    rejectRefresh(refreshErr);

    await expect(p1).rejects.toBe(refreshErr);
    await expect(p2).rejects.toBe(refreshErr);
    await expect(p3).rejects.toBe(refreshErr);

    expect(retry).not.toHaveBeenCalled();
    expect(redirectToLogin).toHaveBeenCalledTimes(1);
    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });
});
