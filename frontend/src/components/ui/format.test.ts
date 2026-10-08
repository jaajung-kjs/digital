import { describe, expect, it } from 'vitest';
import {
  EMPTY, dbText, formatDate, formatManDays, formatManDaysFixed, formatMeasure, formatNumber, formatPercent, formatSourceDate, formatWon,
  joinParts, kmText, lengthText, today, unitValueText,
} from './format';

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
  it('수 꼴 — 원·공량·길이·dB·율 helper 하나씩, SI 단위는 띄운다', () => {
    expect(formatWon(1234567)).toBe('1,234,567');
    expect(formatManDays(0.5)).toBe('0.5');
    expect(formatManDays(1)).toBe('1');
    expect(formatManDays(0.1234)).toBe('0.123');
    expect(formatManDaysFixed(1)).toBe('1.000');
    expect(formatManDaysFixed(0.5)).toBe('0.500');
    expect(lengthText(12)).toBe('12 m');
    expect(kmText(8.5)).toBe('8.5 km');
    expect(formatMeasure(-6.435)).toBe('-6.435');
    expect(formatMeasure(1234.5)).toBe('1234.5');
    expect(dbText(-13.05)).toBe('-13.05 dB');
    expect(formatPercent(0.0321)).toBe('3.21%');
    expect(formatPercent(0.1)).toBe('10%');
  });
  it('unitValueText — 분명한 수+단위만 띄운다, 저장 글은 그대로 둔다', () => {
    expect(unitValueText('50A')).toBe('50 A');
    expect(unitValueText('50 A')).toBe('50 A');
    expect(unitValueText('220V')).toBe('220 V');
    expect(unitValueText('2.5A')).toBe('2.5 A');
    expect(unitValueText('AC220V')).toBe('AC220V');
    expect(unitValueText('3P 30A')).toBe('3P 30A');
    expect(unitValueText('50a')).toBe('50a');
  });
  it('joinParts — 병합 칸은 빈 조각을 뺀다(「— · 50 A」 금지)', () => {
    expect(joinParts([null, '50 A'])).toBe('50 A');
    expect(joinParts(['', EMPTY, '50 A'])).toBe('50 A');
    expect(joinParts(['220 V', '50 A'])).toBe('220 V · 50 A');
    expect(joinParts(['F-CV', null])).toBe('F-CV');
    expect(joinParts([null, undefined, false])).toBeNull();
  });
  it('formatSourceDate — 원문 시기 표기를 YYYY-MM-DD 로, 못 읽으면 원문', () => {
    expect(formatSourceDate('2026.1.1')).toBe('2026-01-01');
    expect(formatSourceDate('2026. 4.30. 입찰공고분 부터')).toBe('2026-04-30');
    expect(formatSourceDate('2026-10-08')).toBe('2026-10-08');
    expect(formatSourceDate('상반기')).toBe('상반기');
    expect(formatSourceDate(null)).toBe(EMPTY);
  });
});
