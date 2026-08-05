import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Request, Response, NextFunction } from 'express';
import { log, errorFields, requestLogger } from '../log.js';

/**
 * 로그 "형식"을 테스트로 고정한다.
 *
 * 운영에서 이 줄들을 `docker logs | jq` 로 거른다. 필드 이름이 조용히 바뀌면 장애 때
 * 아무것도 못 찾는다 — 그래서 모양을 테스트가 붙잡는다. 특히 **토큰·본문이 새지 않는지**.
 */

function fakeRes(status: number) {
  const res = new EventEmitter() as unknown as Response & EventEmitter;
  (res as unknown as { statusCode: number }).statusCode = status;
  return res;
}

function fakeReq(over: Partial<Request> = {}): Request {
  return { method: 'GET', path: '/api/v2/org-tree', originalUrl: '/api/v2/org-tree', ...over } as Request;
}

afterEach(() => vi.restoreAllMocks());

describe('구조화 로그', () => {
  it('한 줄에 JSON 하나 — ts/level/event 를 항상 포함한다', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log.info('server.start', { port: 3000 });
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line).toMatchObject({ level: 'info', event: 'server.start', port: 3000 });
    expect(typeof line.ts).toBe('string');
    expect(spy.mock.calls[0][0]).not.toContain('\n');
  });

  it('error 는 stderr 로 나간다 — 수집기가 심각도로 가를 수 있게', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    log.error('unhandled', {});
    expect(err).toHaveBeenCalledTimes(1);
    expect(out).not.toHaveBeenCalled();
  });

  it('errorFields 는 스택을 8줄로 자른다 — 로그가 스택으로 뒤덮이지 않게', () => {
    const e = new Error('터짐');
    const f = errorFields(e) as { errName: string; errMessage: string; stack: string };
    expect(f.errName).toBe('Error');
    expect(f.errMessage).toBe('터짐');
    expect(f.stack.split('\n').length).toBeLessThanOrEqual(8);
  });

  it('Error 가 아닌 값도 삼키지 않는다', () => {
    expect(errorFields('문자열 거부')).toMatchObject({ errMessage: '문자열 거부' });
  });
});

describe('요청 로거', () => {
  it('응답이 끝난 뒤 상태·소요시간·사용자와 함께 한 줄 남긴다', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const req = fakeReq({ user: { userId: 'u1', username: 'admin', role: 'admin' } } as Partial<Request>);
    const res = fakeRes(200);
    requestLogger(req, res, (() => {}) as NextFunction);
    expect(spy).not.toHaveBeenCalled(); // finish 전에는 찍지 않는다
    (res as unknown as EventEmitter).emit('finish');

    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line).toMatchObject({ event: 'request', method: 'GET', path: '/api/v2/org-tree', status: 200, userId: 'u1' });
    expect(typeof line.ms).toBe('number');
    expect(typeof line.requestId).toBe('string');
  });

  it('쿼리스트링은 싣지 않는다 — 토큰이 실릴 수 있다', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const req = fakeReq({ originalUrl: '/api/v2/search?q=abc&token=secret' });
    const res = fakeRes(200);
    requestLogger(req, res, (() => {}) as NextFunction);
    (res as unknown as EventEmitter).emit('finish');
    const raw = spy.mock.calls[0][0] as string;
    expect(raw).not.toContain('secret');
    expect(JSON.parse(raw).path).toBe('/api/v2/search');
  });

  it('4xx 는 warn, 5xx 는 error 로 올린다', () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    const r4 = fakeRes(404);
    requestLogger(fakeReq(), r4, (() => {}) as NextFunction);
    (r4 as unknown as EventEmitter).emit('finish');
    expect(JSON.parse(out.mock.calls[0][0] as string).level).toBe('warn');

    const r5 = fakeRes(500);
    requestLogger(fakeReq(), r5, (() => {}) as NextFunction);
    (r5 as unknown as EventEmitter).emit('finish');
    expect(JSON.parse(err.mock.calls[0][0] as string).level).toBe('error');
  });

  it('/health 는 남기지 않는다 — 헬스체크가 로그를 덮지 않게', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const req = fakeReq({ path: '/health', originalUrl: '/health' });
    const res = fakeRes(200);
    let nexted = false;
    requestLogger(req, res, (() => {
      nexted = true;
    }) as NextFunction);
    (res as unknown as EventEmitter).emit('finish');
    expect(nexted).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});
