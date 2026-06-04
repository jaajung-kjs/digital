import { describe, it, expect } from 'vitest';
import { buildColumns, attrValue } from './columns';
import type { AssetType } from '../../types/asset';

const pitr: AssetType = {
  id: 't1', code: 'PITR', name: '계통보호전송장치', group: '통신', isContainer: false,
  fieldTemplate: [
    { key: 'tlName', label: 'T/L명', type: 'text' },
    { key: 'model', label: '모델명', type: 'text' },
  ],
  requiredToCreate: ['name'], iconName: null, displayColor: '#000', sortOrder: 40, isActive: true,
};

describe('buildColumns', () => {
  it('항상 이름 컬럼을 먼저 둔다', () => {
    const cols = buildColumns([pitr]);
    expect(cols[0]).toEqual({ key: 'name', label: '이름', kind: 'name' });
  });

  it('표시된 종류들의 fieldTemplate 필드를 중복 없이 컬럼으로 만든다', () => {
    const cols = buildColumns([pitr]);
    const keys = cols.map((c) => c.key);
    expect(keys).toContain('tlName');
    expect(keys).toContain('model');
  });

  it('여러 종류의 같은 key 는 한 번만 나온다', () => {
    const rtu: AssetType = { ...pitr, id: 't2', code: 'RTU',
      fieldTemplate: [{ key: 'model', label: '모델명', type: 'text' }] };
    const cols = buildColumns([pitr, rtu]);
    expect(cols.filter((c) => c.key === 'model')).toHaveLength(1);
  });

  it('attrValue 는 attributes 에서 값을 읽고 없으면 빈 문자열', () => {
    expect(attrValue({ model: 'CT-1000' }, 'model')).toBe('CT-1000');
    expect(attrValue({ model: 'CT-1000' }, 'vendor')).toBe('');
    expect(attrValue(null, 'model')).toBe('');
  });
});
