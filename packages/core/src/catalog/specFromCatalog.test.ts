import { describe, expect, it } from 'vitest';
import { specFromCatalog, specFromUpsert } from './specFromCatalog.js';
import type { TypeUpsertBody } from './types.js';

const row = {
  key: 'RACK', name: '랙', sortOrder: 10,
  category: { key: '구조' },
  placeable: true, defaultWidth: 60, defaultHeight: 80,
  laborType: '통신내선공', installHours: 2, removeHours: 1, relocateHours: 3,
  containerSpecs: [
    { key: 'b', name: 'B', slotCount: null, allowSpan: false, accepts: {}, sortOrder: 2 },
    { key: 'a', name: 'A', slotCount: 12, allowSpan: true, accepts: { categoryKeys: ['통신'] }, sortOrder: 1 },
  ],
  portTemplates: [{ group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}', sortOrder: 0 }],
};

describe('specFromCatalog', () => {
  it('구조적 행 → AssetTypeSpec (컨테이너 sortOrder 정렬 포함)', () => {
    const spec = specFromCatalog(row);
    expect(spec.key).toBe('RACK');
    expect(spec.categoryKey).toBe('구조');
    expect(spec.placement).toEqual({ placeable: true, defaultWidth: 60, defaultHeight: 80 });
    expect(spec.containers.map((c) => c.key)).toEqual(['a', 'b']);
    expect(spec.ports[0]).toMatchObject({ group: 'P', medium: 'network' });
  });
  it('null 기본크기는 placement에서 생략', () => {
    const spec = specFromCatalog({ ...row, defaultWidth: null, defaultHeight: null });
    expect('defaultWidth' in spec.placement).toBe(false);
  });
});

describe('specFromUpsert', () => {
  // row와 동일한 타입을 upsert 바디(평평한 wire 형상)로 표현 — containers/ports는
  // 배열 순서가 곧 sortOrder이므로 row가 정렬 후 산출하는 순서(a, b)로 미리 정렬해 둔다.
  const body: TypeUpsertBody = {
    key: 'RACK', name: '랙', categoryId: 'cat-구조', sortOrder: 10, isActive: true,
    placeable: true, defaultWidth: 60, defaultHeight: 80,
    laborType: '통신내선공', installHours: 2, removeHours: 1, relocateHours: 3,
    containers: [
      { key: 'a', name: 'A', slotCount: 12, allowSpan: true, accepts: { categoryKeys: ['통신'] } },
      { key: 'b', name: 'B', slotCount: null, allowSpan: false, accepts: {} },
    ],
    ports: [{ group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' }],
  };

  it('동일 타입을 표현한 upsert 바디 → specFromCatalog(행)과 동등한 spec을 낸다', () => {
    const fromBody = specFromUpsert(body, '구조');
    const fromRow = specFromCatalog(row);
    expect(fromBody).toEqual(fromRow);
  });

  it('null 기본크기는 placement에서 생략 (specFromCatalog와 동일 규약)', () => {
    const spec = specFromUpsert({ ...body, defaultWidth: null, defaultHeight: null }, '구조');
    expect('defaultWidth' in spec.placement).toBe(false);
    expect('defaultHeight' in spec.placement).toBe(false);
  });

  it('categoryKey는 호출자가 넘긴 값을 그대로 쓴다 (DB/HTTP 무지)', () => {
    const spec = specFromUpsert(body, '임의키');
    expect(spec.categoryKey).toBe('임의키');
  });
});
