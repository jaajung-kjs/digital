import { describe, expect, it } from 'vitest';
import type { AssetTypeSpec } from './types.js';
import { instantiatePorts } from './instantiatePorts.js';

const slotType: AssetTypeSpec = {
  key: 'OFD-SLOT',
  name: '광슬롯',
  categoryKey: '통신',
  sortOrder: 1,
  placement: { placeable: false },
  labor: { laborType: null, installHours: 0, removeHours: 0, relocateHours: 0 },
  fields: [],
  containers: [],
  ports: [
    { group: 'A', count: 4, direction: 'BI', medium: '광', namePattern: '장비 {n}' },
    { group: 'B', count: 4, direction: 'BI', medium: '광', namePattern: '선로 {n}' },
  ],
  links: [{ fromGroup: 'A', toGroup: 'B', mapping: 'byIndex' }],
};

describe('instantiatePorts', () => {
  it('템플릿 수량만큼 1-based 인덱스와 이름 패턴으로 생성한다', () => {
    const ports = instantiatePorts(slotType, 'asset-1');
    expect(ports).toHaveLength(8);
    expect(ports[0]).toEqual({
      assetId: 'asset-1',
      group: 'A',
      index: 1,
      name: '장비 1',
      direction: 'BI',
      medium: '광',
      positions: 1,
    });
    expect(ports[7]!.name).toBe('선로 4');
  });

  it('그룹별 수량 오버라이드를 적용한다 (24C 슬롯)', () => {
    const ports = instantiatePorts(slotType, 'asset-1', { A: 24, B: 24 });
    expect(ports).toHaveLength(48);
    expect(ports[23]!.name).toBe('장비 24');
  });

  it('포트 템플릿이 없으면 빈 배열', () => {
    const bare = { ...slotType, ports: [], links: [] };
    expect(instantiatePorts(bare, 'x')).toEqual([]);
  });
});
