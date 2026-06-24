import { describe, it, expect } from 'vitest';
import { isOpgwTwin } from './cableEndpoint';

describe('isOpgwTwin (구조: 슬롯↔슬롯 IN-IN)', () => {
  it('IN-IN 이면 cableType 없이도 OPGW', () => {
    expect(isOpgwTwin({ sourceRole: 'IN', targetRole: 'IN' })).toBe(true);
  });
  it('OUT-IN(피더 입력)은 아님', () => {
    expect(isOpgwTwin({ sourceRole: 'OUT', targetRole: 'IN' })).toBe(false);
  });
  it('IN-IN 아니면 아님', () => {
    expect(isOpgwTwin({ sourceRole: 'OUT', targetRole: 'OUT' })).toBe(false);
    expect(isOpgwTwin({})).toBe(false);
  });
});
