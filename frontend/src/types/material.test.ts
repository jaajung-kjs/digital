import { describe, it, expect } from 'vitest';
import { getCableTypeFromGroup } from './material';

describe('getCableTypeFromGroup', () => {
  it('displayGroup 으로 cableType 을 파생한다', () => {
    expect(getCableTypeFromGroup('광')).toBe('FIBER');
    expect(getCableTypeFromGroup('전원')).toBe('AC');
    expect(getCableTypeFromGroup('네트워크')).toBe('LAN');
    expect(getCableTypeFromGroup('제어')).toBe('DC');
    expect(getCableTypeFromGroup('접지')).toBe('GROUND');
  });
  it('미지정은 LAN 폴백', () => {
    expect(getCableTypeFromGroup(null)).toBe('LAN');
    expect(getCableTypeFromGroup(undefined)).toBe('LAN');
  });
});
