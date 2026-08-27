import { describe, expect, it, vi, afterEach } from 'vitest';
import { newId } from '../newId';

/**
 * **평문 주소(사내망)에서도 id 가 만들어져야 한다.**
 *
 * `crypto.randomUUID` 는 https·localhost 에서만 있다. 개발은 localhost 라 늘 있었고, 그래서
 * 운영 이미지를 `http://twin.local:8080` 으로 열어 보기 전까지 아무도 몰랐다 — 층 추가·설비
 * 배치·케이블 연결이 전부 `crypto.randomUUID is not a function` 으로 죽어 있었다.
 */
describe('newId', () => {
  const real = globalThis.crypto;
  afterEach(() => { Object.defineProperty(globalThis, 'crypto', { value: real, configurable: true }); });

  const isUuidV4 = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s);

  it('보안 컨텍스트면 그대로 쓴다', () => {
    const spy = vi.fn(() => '11111111-2222-4333-8444-555555555555');
    Object.defineProperty(globalThis, 'crypto', { value: { randomUUID: spy }, configurable: true });
    expect(newId()).toBe('11111111-2222-4333-8444-555555555555');
    expect(spy).toHaveBeenCalled();
  });

  it('randomUUID 가 없어도 UUID v4 를 만든다 — 평문 주소가 그렇다', () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues: (a: Uint8Array) => { for (let i = 0; i < a.length; i++) a[i] = i * 7 + 1; return a; } },
      configurable: true,
    });
    const id = newId();
    expect(isUuidV4(id), id).toBe(true);
  });

  it('crypto 자체가 없어도 만든다', () => {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    const ids = new Set(Array.from({ length: 200 }, () => newId()));
    expect(ids.size).toBe(200); // 겹치지 않는다
    expect([...ids].every(isUuidV4)).toBe(true);
  });
});
