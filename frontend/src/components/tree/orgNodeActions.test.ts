import { describe, it, expect } from 'vitest';
import { childType, childLabel } from './orgNodeActions';

describe('orgNodeActions', () => {
  it('childType: hq→branch, branch→substation, substation→floor, floor→null', () => {
    expect(childType('headquarters')).toBe('branch');
    expect(childType('branch')).toBe('substation');
    expect(childType('substation')).toBe('floor');
    expect(childType('floor')).toBeNull();
  });
  it('childLabel: 자식 추가 라벨', () => {
    expect(childLabel('headquarters')).toBe('지사 추가');
    expect(childLabel('branch')).toBe('변전소 추가');
    expect(childLabel('substation')).toBe('층 추가');
    expect(childLabel('floor')).toBeNull();
  });
});
