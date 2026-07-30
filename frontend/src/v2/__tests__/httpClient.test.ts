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
 *   - refresh 실패 → 토큰 삭제 + 주입된 onSessionInvalid 핸들러 호출 + 대기 큐 전부 reject
 *   - refresh 토큰 없음 → 즉시 토큰 삭제 + onSessionInvalid 호출
 *   - /auth/login·/auth/refresh 401 → refresh 시도 없이 전파
 *   - 동시 401 단일 비행: refresh 1회, 전원 재시도
 *   - setSessionInvalidHandler/invokeSessionInvalid: 등록된 핸들러 우선 호출,
 *     미등록 시(테스트/부트 이전)에만 하드 리다이렉트 폴백(B-V2)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AxiosError, InternalAxiosRequestConfig } from 'axios';
import {
  tokenStorage,
  createRequestOnFulfilled,
  createResponseOnRejected,
  setSessionInvalidHandler,
  getSessionInvalidHandler,
  invokeSessionInvalid,
  productionResponseDeps,
  type ResponseInterceptorDeps,
} from '../httpClient';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  // 이 파일의 다른 describe 가 등록한 핸들러가 남아 다음 테스트에 새지 않도록 정리.
  setSessionInvalidHandler(null);
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
    onSessionInvalid: vi.fn(),
    ...overrides,
  };
  return {
    deps,
    retry: deps.retry as ReturnType<typeof vi.fn>,
    postRefresh: deps.postRefresh as unknown as ReturnType<typeof vi.fn>,
    onSessionInvalid: deps.onSessionInvalid as ReturnType<typeof vi.fn>,
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
    const { deps, retry, postRefresh, onSessionInvalid } = makeDeps();
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
    expect(onSessionInvalid).not.toHaveBeenCalled();
  });

  it('재시도 요청(_retry=true)의 401 → 그대로 reject, 2차 refresh 없음', async () => {
    tokenStorage.setRefreshToken('old-refresh');
    const { deps, postRefresh } = makeDeps();
    const onRejected = createResponseOnRejected(deps);

    const err = make401('/v2/data', true); // _retry 이미 설정
    await expect(onRejected(err)).rejects.toBe(err);
    expect(postRefresh).not.toHaveBeenCalled();
  });

  it('refresh 실패 → 토큰 삭제 + onSessionInvalid', async () => {
    tokenStorage.setAccessToken('old-access');
    tokenStorage.setRefreshToken('old-refresh');
    const refreshErr = new Error('INVALID_REFRESH');
    const { deps, retry, onSessionInvalid } = makeDeps({
      postRefresh: vi.fn().mockRejectedValue(refreshErr) as unknown as ResponseInterceptorDeps['postRefresh'],
    });
    const onRejected = createResponseOnRejected(deps);

    await expect(onRejected(make401('/v2/data'))).rejects.toBe(refreshErr);

    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
    expect(onSessionInvalid).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
  });

  it('refresh 토큰 없음 → 즉시 토큰 삭제 + onSessionInvalid, refresh 미호출', async () => {
    tokenStorage.setAccessToken('old-access');
    // refreshToken 없음
    const { deps, postRefresh, onSessionInvalid } = makeDeps();
    const onRejected = createResponseOnRejected(deps);

    const err = make401('/v2/data');
    await expect(onRejected(err)).rejects.toBe(err);

    expect(postRefresh).not.toHaveBeenCalled();
    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(onSessionInvalid).toHaveBeenCalledTimes(1);
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
    const { deps, retry, onSessionInvalid } = makeDeps({
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
    expect(onSessionInvalid).toHaveBeenCalledTimes(1);
    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });
});

// ── invokeSessionInvalid: 등록된 핸들러 우선, 미등록 시에만 하드 리다이렉트 ──
describe('invokeSessionInvalid — 핸들러 등록 여부에 따른 분기 (B-V2)', () => {
  it('핸들러 등록됨 → 핸들러만 호출, 하드 리다이렉트(location.href 변경) 없음', () => {
    const originalHref = window.location.href;
    const handler = vi.fn();

    setSessionInvalidHandler(handler);
    expect(getSessionInvalidHandler()).toBe(handler);

    invokeSessionInvalid();

    expect(handler).toHaveBeenCalledTimes(1);
    // 프로덕션 refresh 실패 경로가 이 함수를 호출하는 목적 자체가 하드 리로드
    // 제거(스토어 리셋 기반 재렌더로 대체)이므로, location 은 건드리지 않아야 한다.
    expect(window.location.href).toBe(originalHref);
  });

  it('핸들러 미등록(테스트/부트 이전) → 하드 리다이렉트 폴백', () => {
    expect(getSessionInvalidHandler()).toBeNull();

    // jsdom 은 실제 navigation 을 구현하지 않으므로 location 을 로컬 stub 으로
    // 교체해 href 대입만 관찰한다(실제 페이지 이동 없이 폴백 분기만 검증).
    const originalLocation = window.location;
    const stub = { href: originalLocation.href } as Location;
    Object.defineProperty(window, 'location', { value: stub, writable: true, configurable: true });

    try {
      invokeSessionInvalid();
      expect(stub.href).toBe('/login');
    } finally {
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      });
    }
  });
});

// ── 프로덕션 배선 고정 ────────────────────────────────────────────────────────
// 조각별 로직이 전부 그린이어도 배선이 빠지면 런타임이 죽는다(과거 전례).
// 프로덕션 deps 가 실제 tokenStorage·invokeSessionInvalid 를 물고 있는지 고정한다.
describe('프로덕션 인터셉터 배선', () => {
  it('productionResponseDeps 가 실 tokenStorage 와 invokeSessionInvalid 를 사용한다', () => {
    expect(productionResponseDeps.storage).toBe(tokenStorage);
    expect(productionResponseDeps.onSessionInvalid).toBe(invokeSessionInvalid);
    expect(typeof productionResponseDeps.retry).toBe('function');
    expect(typeof productionResponseDeps.postRefresh).toBe('function');
  });
});
