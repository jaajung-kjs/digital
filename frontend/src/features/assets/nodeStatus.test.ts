import { describe, it, expect } from 'vitest';
import { installLocation, inspectionState } from './nodeStatus';

const base = { substationName: '춘천S/S', floorName: null, roomText: null } as const;
describe('installLocation', () => {
  it('floorName 우선', () => expect(installLocation({ ...base, floorName: '통신실' })).toBe('춘천S/S 통신실'));
  it('floor 없으면 roomText', () => expect(installLocation({ ...base, roomText: '배전실' })).toBe('춘천S/S 배전실'));
  it('둘 다 없으면 변전소명', () => expect(installLocation(base)).toBe('춘천S/S'));
});
describe('inspectionState', () => {
  const today = new Date('2026-06-06T00:00:00Z');
  it('null → 미점검(none)', () => expect(inspectionState(null, today).level).toBe('none'));
  it('1년 초과 → overdue', () => expect(inspectionState('2025-01-01', today).level).toBe('overdue'));
  it('최근 → ok', () => expect(inspectionState('2026-05-01', today).level).toBe('ok'));
});
