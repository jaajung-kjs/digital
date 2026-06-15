import { describe, it, expect } from 'vitest';
import { endpointAssetId, type EndpointRef } from './cableEndpoint';

const base: EndpointRef = { containerAssetId: 'eq1', position: { x: 0, y: 0 } };

describe('endpointAssetId — slot > inner > container 우선순위', () => {
  it('평면 설비: container', () => {
    expect(endpointAssetId(base)).toBe('eq1');
  });
  it('랙 모듈/피더: inner 우선', () => {
    expect(endpointAssetId({ ...base, innerAssetId: 'mod1' })).toBe('mod1');
  });
  it('경로슬롯: slot 최우선', () => {
    expect(endpointAssetId({ ...base, innerAssetId: 'x', slotId: 'slot1' })).toBe('slot1');
  });
});
