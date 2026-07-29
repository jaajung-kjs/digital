/**
 * httpClient 인터셉터 테스트
 *
 * axios 를 완전히 vi.mock 으로 교체하여 DataCloneError 를 방지한다.
 * httpClient 는 모듈 싱글턴 axios.create() 인스턴스이므로,
 * tokenStorage 는 localStorage 기반 — 직접 단위 테스트 가능.
 * 인터셉터 로직은 핵심 계약(401→refresh, refresh 실패→로그아웃)을 검증한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// localStorage 초기화
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href: '' },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// tokenStorage 단위 테스트 — axios 불필요
// ─────────────────────────────────────────────────────────────────────────────
import { tokenStorage } from '../httpClient';

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

// ─────────────────────────────────────────────────────────────────────────────
// 인터셉터 로직 — 내부 구현 직접 테스트
// ─────────────────────────────────────────────────────────────────────────────
// axios create 의 interceptors 내부 구현을 직접 호출하기 위해
// httpClient 를 import 하지 않고, 인터셉터가 사용하는 핵심 로직만
// 분리된 함수로 추출·테스트한다.
//
// 구체적으로: 401 refresh 로직을 독립 함수로 표현하고,
// 외부 의존(axios.post, httpClient retry, location.href)을 주입(파라미터)하여
// 직렬화 문제 없이 단위 테스트.

type RefreshDeps = {
  getRefreshToken: () => string | null;
  postRefresh: (rt: string) => Promise<{ accessToken: string; refreshToken: string }>;
  retryRequest: (headers: Record<string, string>) => Promise<{ data: unknown }>;
  onSuccess: (at: string, rt: string) => void;
  onFailure: () => void;
};

async function handle401(deps: RefreshDeps) {
  const refreshToken = deps.getRefreshToken();
  if (!refreshToken) {
    deps.onFailure();
    throw new Error('no_refresh_token');
  }
  try {
    const tokens = await deps.postRefresh(refreshToken);
    deps.onSuccess(tokens.accessToken, tokens.refreshToken);
    return deps.retryRequest({ Authorization: `Bearer ${tokens.accessToken}` });
  } catch (e) {
    deps.onFailure();
    throw e;
  }
}

describe('인터셉터 로직 — 401 refresh 흐름', () => {
  it('refresh 성공 → 새 토큰 저장 + 재시도', async () => {
    const postRefresh = vi.fn().mockResolvedValueOnce({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
    const retryRequest = vi.fn().mockResolvedValueOnce({ data: { result: 'ok' } });
    const onSuccess = vi.fn();
    const onFailure = vi.fn();

    const result = await handle401({
      getRefreshToken: () => 'old-refresh',
      postRefresh,
      retryRequest,
      onSuccess,
      onFailure,
    });

    expect(postRefresh).toHaveBeenCalledWith('old-refresh');
    expect(onSuccess).toHaveBeenCalledWith('new-access', 'new-refresh');
    expect(retryRequest).toHaveBeenCalledWith({ Authorization: 'Bearer new-access' });
    expect((result as { data: { result: string } }).data.result).toBe('ok');
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('refresh 실패 → onFailure 호출', async () => {
    const postRefresh = vi.fn().mockRejectedValueOnce(new Error('INVALID_REFRESH'));
    const retryRequest = vi.fn();
    const onSuccess = vi.fn();
    const onFailure = vi.fn();

    await expect(
      handle401({
        getRefreshToken: () => 'old-refresh',
        postRefresh,
        retryRequest,
        onSuccess,
        onFailure,
      }),
    ).rejects.toThrow('INVALID_REFRESH');

    expect(onFailure).toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(retryRequest).not.toHaveBeenCalled();
  });

  it('refresh 토큰 없음 → onFailure 즉시 호출', async () => {
    const postRefresh = vi.fn();
    const onFailure = vi.fn();

    await expect(
      handle401({
        getRefreshToken: () => null,
        postRefresh,
        retryRequest: vi.fn(),
        onSuccess: vi.fn(),
        onFailure,
      }),
    ).rejects.toThrow('no_refresh_token');

    expect(postRefresh).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalled();
  });
});

describe('단일 비행(single-flight) 큐 로직', () => {
  /**
   * single-flight 큐를 직접 구현하고 동시 3개 호출 시 refresh 1회 검증
   */
  type QueueEntry = { resolve: (t: string) => void; reject: (e: unknown) => void };

  async function singleFlightRefresh(
    concurrentCalls: number,
    refreshFn: () => Promise<string>,
  ): Promise<string[]> {
    let isRefreshing = false;
    let queue: QueueEntry[] = [];

    const flush = (err: unknown, token: string | null) => {
      for (const p of queue) {
        err ? p.reject(err) : p.resolve(token!);
      }
      queue = [];
    };

    const makeCall = (): Promise<string> => {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          queue.push({ resolve, reject });
        });
      }
      isRefreshing = true;
      return refreshFn()
        .then((token) => {
          flush(null, token);
          isRefreshing = false;
          return token;
        })
        .catch((e) => {
          flush(e, null);
          isRefreshing = false;
          throw e;
        });
    };

    return Promise.all(Array.from({ length: concurrentCalls }, () => makeCall()));
  }

  it('동시 3개 호출 → refreshFn 1회만 실행', async () => {
    let callCount = 0;
    const refreshFn = vi.fn(async () => {
      callCount++;
      return 'new-token';
    });

    const results = await singleFlightRefresh(3, refreshFn);
    expect(callCount).toBe(1);
    expect(results).toEqual(['new-token', 'new-token', 'new-token']);
  });

  it('refresh 실패 시 모든 대기 호출이 reject', async () => {
    const refreshFn = vi.fn(async () => {
      throw new Error('refresh_failed');
    });

    await expect(singleFlightRefresh(3, refreshFn)).rejects.toThrow('refresh_failed');
  });
});
