import { describe, it, expect } from 'vitest';
import { buildColumns } from './columns';
import type { AssetType } from '../../types/asset';

const pitr: AssetType = {
  id: 't1', code: 'PITR', name: '계통보호전송장치', group: '통신', isContainer: false,
  fieldTemplate: [
    { key: 'tlName', label: 'T/L명', type: 'text' },
    { key: 'model', label: '모델명', type: 'text' },
  ],
  requiredToCreate: ['name'], iconName: null, displayColor: '#000', placementKind: null, sortOrder: 40, isActive: true,
};

describe('buildColumns', () => {
  // #7: Asset.attributes 제거 — fieldTemplate 기반 속성 컬럼은 더 이상 만들지 않는다.
  it('이름 컬럼만 둔다(속성 컬럼 없음)', () => {
    const cols = buildColumns([pitr]);
    expect(cols).toEqual([{ key: 'name', label: '이름', kind: 'name' }]);
  });

  it('종류가 여러 개여도 이름 컬럼만', () => {
    const rtu: AssetType = { ...pitr, id: 't2', code: 'RTU',
      fieldTemplate: [{ key: 'model', label: '모델명', type: 'text' }] };
    expect(buildColumns([pitr, rtu])).toEqual([{ key: 'name', label: '이름', kind: 'name' }]);
  });
});
