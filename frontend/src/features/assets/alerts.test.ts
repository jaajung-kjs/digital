import { describe, it, expect } from 'vitest';
import { assetAlert } from './alerts';
import type { Asset } from '../../types/asset';

const base = { warrantyUntil: null, replaceDue: null } as unknown as Asset;
const today = new Date('2026-06-05');

describe('assetAlert', () => {
  it('둘 다 없으면 null', () => {
    expect(assetAlert(base, today)).toBeNull();
  });
  it('하자보수기한이 6개월 이내면 warranty 경고', () => {
    const a = { ...base, warrantyUntil: '2026-09-01' } as Asset;
    expect(assetAlert(a, today)?.kind).toBe('warranty');
  });
  it('하자보수기한이 6개월보다 멀면 null', () => {
    const a = { ...base, warrantyUntil: '2027-06-01' } as Asset;
    expect(assetAlert(a, today)).toBeNull();
  });
  it('교체예정이 오늘 이전/당일이면 replace 경고', () => {
    const a = { ...base, replaceDue: '2026-06-05' } as Asset;
    expect(assetAlert(a, today)?.kind).toBe('replace');
  });
  it('교체예정이 미래면 null', () => {
    const a = { ...base, replaceDue: '2027-01-01' } as Asset;
    expect(assetAlert(a, today)).toBeNull();
  });
});
