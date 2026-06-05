import { describe, it, expect } from 'vitest';
import { collectConflicts } from '../src/services/concurrency.js';

describe('collectConflicts', () => {
  const current = new Map<string, Date>([['a', new Date('2026-06-05T00:00:00.000Z')]]);
  it('base 일치면 충돌 없음', () => {
    const c = collectConflicts('assets', current, [{ id: 'a', baseVersion: '2026-06-05T00:00:00.000Z', name: 'A' }]);
    expect(c).toEqual([]);
  });
  it('base 불일치면 충돌', () => {
    const c = collectConflicts('assets', current, [{ id: 'a', baseVersion: '2025-01-01T00:00:00.000Z', name: 'A' }]);
    expect(c).toEqual([{ collection: 'assets', id: 'a', name: 'A' }]);
  });
  it('서버에 없으면(타인이 삭제) 충돌', () => {
    const c = collectConflicts('assets', current, [{ id: 'gone', baseVersion: 'x', name: 'G' }]);
    expect(c).toEqual([{ collection: 'assets', id: 'gone', name: 'G' }]);
  });
  it('baseVersion null(신규 등) 은 검사 안 함', () => {
    const c = collectConflicts('assets', current, [{ id: 'a', baseVersion: null, name: 'A' }]);
    expect(c).toEqual([]);
  });
});
