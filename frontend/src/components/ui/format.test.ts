import { describe, expect, it } from 'vitest';
import { EMPTY, formatDate, formatNumber, today } from './format';

describe('format', () => {
  it('formatDate — 앞 열 글자, 비면 EMPTY', () => {
    expect(formatDate('2026-10-08T09:00:00Z')).toBe('2026-10-08');
    expect(formatDate(null)).toBe(EMPTY);
  });
  it('formatNumber — ko-KR 천 단위 구분, 소수는 지정한 자리까지', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(1.23456, 2)).toBe('1.23');
  });
  it('today — 이 기기의 날짜 YYYY-MM-DD', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
