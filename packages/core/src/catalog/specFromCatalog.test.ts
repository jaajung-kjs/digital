import { describe, expect, it } from 'vitest';
import { specFromCatalog } from './specFromCatalog.js';

const row = {
  key: 'RACK', name: '랙', sortOrder: 10,
  category: { key: '구조' },
  placeable: true, defaultWidth: 60, defaultHeight: 80,
  laborType: '통신내선공', installHours: 2, removeHours: 1, relocateHours: 3,
  fieldDefs: [{ key: 'installDate', label: '설치일', type: 'date' }],
  containerSpecs: [
    { key: 'b', name: 'B', slotCount: null, allowSpan: false, accepts: {}, sortOrder: 2 },
    { key: 'a', name: 'A', slotCount: 12, allowSpan: true, accepts: { categoryKeys: ['통신'] }, sortOrder: 1 },
  ],
  portTemplates: [{ group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}', sortOrder: 0 }],
  linkRules: [{ fromGroup: 'A', toGroup: 'B', mapping: 'byIndex' }],
};

describe('specFromCatalog', () => {
  it('구조적 행 → AssetTypeSpec (컨테이너 sortOrder 정렬 포함)', () => {
    const spec = specFromCatalog(row);
    expect(spec.key).toBe('RACK');
    expect(spec.categoryKey).toBe('구조');
    expect(spec.placement).toEqual({ placeable: true, defaultWidth: 60, defaultHeight: 80 });
    expect(spec.containers.map((c) => c.key)).toEqual(['a', 'b']);
    expect(spec.ports[0]).toMatchObject({ group: 'P', medium: 'network' });
    expect(spec.links[0]).toEqual({ fromGroup: 'A', toGroup: 'B', mapping: 'byIndex' });
  });
  it('null 기본크기는 placement에서 생략', () => {
    const spec = specFromCatalog({ ...row, defaultWidth: null, defaultHeight: null });
    expect('defaultWidth' in spec.placement).toBe(false);
  });
});
