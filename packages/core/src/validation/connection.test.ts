import { describe, expect, it } from 'vitest';
import type { PortRef } from '../catalog/types.js';
import { validateConnection } from './connection.js';

const port = (id: string, medium = '광'): PortRef => ({
  id,
  assetId: `asset-${id}`,
  group: 'A',
  index: 1,
  name: id,
  direction: 'BI',
  medium,
});

describe('validateConnection', () => {
  it('유효한 연결은 null', () => {
    expect(validateConnection(port('p1'), port('p2'), new Set())).toBeNull();
  });

  it('같은 포트끼리 → same-port', () => {
    expect(validateConnection(port('p1'), port('p1'), new Set())).toBe('same-port');
  });

  it('이미 점유된 포트 → port-occupied', () => {
    expect(validateConnection(port('p1'), port('p2'), new Set(['p2']))).toBe('port-occupied');
  });

  it('매체 불일치 → medium-mismatch', () => {
    expect(validateConnection(port('p1', '광'), port('p2', '전원'), new Set())).toBe('medium-mismatch');
  });
});
