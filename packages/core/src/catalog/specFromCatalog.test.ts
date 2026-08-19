import { describe, expect, it } from 'vitest';
import { specFromCatalog, specFromUpsert } from './specFromCatalog.js';
import type { TypeUpsertBody } from './types.js';

const row = {
  key: 'PITR-5000', name: 'PITR-5000', sortOrder: 10,
  category: { key: '통신' },
  laborCode: '통신내선공', installManDays: 2, removeManDays: 1, relocateManDays: 3,
  portTemplates: [{ group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}', sortOrder: 0 }],
};

describe('specFromCatalog', () => {
  it('행을 그대로 옮긴다 — 포트는 sortOrder 순', () => {
    const spec = specFromCatalog(row);
    expect(spec).toMatchObject({ key: 'PITR-5000', categoryKey: '통신', sortOrder: 10 });
    expect(spec.ports).toHaveLength(1);
  });

  /* 도면 배치는 이제 **설비 품목**의 일이다 — 장비 품목에는 배치 여부도 기본 크기도 없다.
     (기본 크기는 저장·편집만 되고 읽는 곳이 한 군데도 없는 죽은 값이기도 했다.) */
  it('배치에 관한 것은 장비 품목이 말하지 않는다', () => {
    expect('placement' in specFromCatalog(row)).toBe(false);
  });
});

describe('specFromUpsert', () => {
  // row 와 같은 종류를 upsert 바디(평평한 wire 형상)로 표현 — 포트는 배열 순서가 곧 sortOrder 다.
  const body: TypeUpsertBody = {
    key: 'PITR-5000', name: 'PITR-5000', categoryId: 'cat-통신', sortOrder: 10,
    laborCode: '통신내선공', installManDays: 2, removeManDays: 1, relocateManDays: 3,
    ports: [{ group: 'P', count: 2, direction: 'BI', medium: 'network', namePattern: '포트 {n}' }],
  };

  it('동일 종류를 표현한 upsert 바디 → specFromCatalog(행)과 동등한 spec을 낸다', () => {
    const fromBody = specFromUpsert(body, '통신');
    const fromRow = specFromCatalog(row);
    expect(fromBody).toEqual(fromRow);
  });

  /* 새로 만들 때는 키를 서버가 붙인다 — 현장에서 쓰는 값이 아니라 참조용 식별자다. */
  it('키가 없으면 빈 문자열로 둔다 — 붙이는 일은 서버 몫이다', () => {
    expect(specFromUpsert({ ...body, key: undefined }, '통신').key).toBe('');
  });

  it('categoryKey는 호출자가 넘긴 값을 그대로 쓴다 (DB/HTTP 무지)', () => {
    const spec = specFromUpsert(body, '임의키');
    expect(spec.categoryKey).toBe('임의키');
  });
});
