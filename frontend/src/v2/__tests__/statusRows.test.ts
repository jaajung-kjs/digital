import { describe, expect, it } from 'vitest';
import { buildStatusRows } from '../statusRows';
import { emptyOverlay, mergeEffective, stageCreate } from '../store/overlay';
import type { V2Asset } from '../types';

/* 설치일·담당자는 타입이 선언하지 않는다 — 모든 자산이 갖는 기본이다(`assetFieldDefs`). */
const types = new Map([
  ['t-mod', { id: 't-mod', name: 'PITR', categoryId: 'c-1' } as never],
]);
const categories = new Map([['c-1', '통신']]);
/* 격자 안의 자리는 행·열로 적는다. 설비 품목으로 놓은 설비는 설비 품목이 곧 분류다. */
const assemblies = new Map([['asm-rack', { id: 'asm-rack', name: '송변전광단말장치' } as never]]);

describe('buildStatusRows (변전소 스코프)', () => {
  const floors = [{ id: 'f-1', name: '1층', sortOrder: 1, substationId: 's' }];
  const rack = { id: 'a-1', name: '랙1', typeId: null, assemblyId: 'asm-rack', status: 'normal', floorId: 'f-1', parentAssetId: null, col: null, row: null, fieldValues: { installDate: '2026-01-01', manager: '홍길동' } };
  const mod = { id: 'a-2', name: '모듈', typeId: 't-mod', status: 'fault', floorId: null, parentAssetId: 'a-1', col: 0, row: 3, fieldValues: {} };
  const unplaced = { id: 'a-3', name: '미배치자산', typeId: 't-mod', status: 'standby', floorId: null, parentAssetId: null, col: null, row: null, fieldValues: {} };

  it('층 배치·격자 배치·미배치 location + 필드·최근점검 계산', () => {
    const { rows } = buildStatusRows({
      assets: [rack, mod, unplaced] as never,
      floors: floors as never,
      typesById: types,
      inspectionsByAsset: new Map([['a-1', ['2026-06-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z']]]),
      assembliesById: assemblies,
    });
    expect(rows[0]).toMatchObject({ id: 'a-1', typeName: '송변전광단말장치', location: '1층', lastInspectedAt: '2026-07-01T00:00:00.000Z', status: 'normal' });
    expect(rows[0]?.fieldValues).toMatchObject({ installDate: '2026-01-01', manager: '홍길동' });
    // 위치는 층까지 거슬러 올라간다 — 예전에는 '랙1 · 4행 1열' 라서 몇 층인지 알 수 없었다.
    expect(rows[1]).toMatchObject({ id: 'a-2', location: '1층 · 랙1 · 4행 1열', lastInspectedAt: null });
    expect(rows[2]).toMatchObject({ id: 'a-3', location: '미배치', status: 'standby', lastInspectedAt: null });
  });

  it('overlay에 스테이지된 자산 create가 mergeEffective→buildStatusRows 경로로 행에 포함된다', () => {
    const saved = [rack] as unknown as V2Asset[];
    const staged = { id: 'tmp-1', name: '신규자산', typeId: 't-mod', status: 'normal', floorId: 'f-1', parentAssetId: null, col: null, row: null, fieldValues: {} } as unknown as V2Asset;
    const overlay = stageCreate(emptyOverlay<V2Asset>(), staged.id, staged);

    const { rows } = buildStatusRows({
      assets: mergeEffective(saved, overlay),
      floors: floors as never,
      typesById: types,
      inspectionsByAsset: new Map(),
      assembliesById: assemblies,
    });

    expect(rows.map((r) => r.id)).toEqual(['a-1', 'tmp-1']);
    expect(rows[1]).toMatchObject({ id: 'tmp-1', name: '신규자산', typeName: 'PITR', location: '1층', status: 'normal' });
  });
});

/* 자산이 갖는 속성은 종류를 가리지 않고 같다. 화면이 `installDate`·`manager` 라는 키를
   직접 알지 않도록 선언에서 받아 온다. */
describe('필드 열 도출', () => {
  const t = (id: string) => [id, { id, name: id, categoryId: 'c-1' } as never] as const;
  const a = (id: string, typeId: string) =>
    ({ id, name: id, typeId, status: 'normal', floorId: null, parentAssetId: null,
       col: null, row: null, fieldValues: {} });
  const build = (assets: object[], typesById: Map<string, never>) =>
    buildStatusRows({
      assets: assets as never, floors: [] as never, typesById,
      inspectionsByAsset: new Map(), assembliesById: new Map(),
    }).fieldColumns.map((f) => f.key);

  it('타입이 섞여도 열은 같다 — 자산 속성은 종류를 가리지 않는다', () => {
    const typesById = new Map([t('A'), t('B')]);
    expect(build([a('1', 'A'), a('2', 'B')], typesById as never)).toEqual(['installDate', 'manager']);
  });
});

/* 설비 품목으로 놓으면 자산이 여럿 생긴다(랙·송광치·OFD·경로슬롯…). 업무에서 세는 단위는 그
   묶음 하나이므로 표가 접을 수 있어야 한다 — 어느 행이 어느 묶음에 드는지는 여기서 나온다. */
describe('설비 묶음', () => {
  const types = new Map([
    ['t', { id: 't', name: 'PITR', categoryId: 'c-1' } as never],
  ]);
  const a = (id: string, over: object = {}) =>
    ({ id, name: id, typeId: 't', status: 'normal', floorId: null, parentAssetId: null,
       col: null, row: null, fieldValues: {}, ...over });

  /* 설비 품목 이름은 글자로 굳혀 두지 않고 설비 품목을 가리킨다 — 이름은 카탈로그에서 읽는다. */
  const assembliesById = new Map([['asm-1', { id: 'asm-1', name: '송변전광단말장치 1식' } as never]]);
  const build = (assets: object[]) =>
    buildStatusRows({
      assets: assets as never, floors: [] as never, typesById: types as never,
      inspectionsByAsset: new Map(), assembliesById,
    }).rows;

  it('뿌리에만 설비 품목 이름이 적히고, 자손은 그 뿌리에 매인다', () => {
    const rows = build([
      a('root', { floorId: 'f1', typeId: null, assemblyId: 'asm-1' }),
      a('kid', { parentAssetId: 'root', col: 0, row: 1 }),
      a('grand', { parentAssetId: 'kid', col: 0, row: 0 }),
    ]);
    expect(rows.map((r) => [r.id, r.assemblyRootId, r.depth])).toEqual([
      ['root', 'root', 0],
      ['kid', 'root', 1],
      ['grand', 'root', 2],
    ]);
  });

  /* 업무에서 "랙이 몇 개" 는 묻지 않는다 — 뿌리는 설비 품목 이름으로 센다. */
  /* 설비 품목 이름을 고치면 이미 놓인 설비의 분류도 따라 바뀐다 — 같은 설비 품목이니까.
     글자로 굳혀 두면 이름을 고치는 순간 같은 설비 품목인데 집계가 둘로 갈린다. */
  it('뿌리의 종류는 설비 품목을 따라간다 — 이름을 굳혀 두지 않는다', () => {
    const rows = build([a('root', { floorId: 'f1', typeId: null, assemblyId: 'asm-1' })]);
    expect(rows[0]!.typeName).toBe('송변전광단말장치 1식');
  });

  it('설비 품목 밖 자산은 매이지 않는다 — 도면에 바로 놓은 단품도 그대로 보인다', () => {
    const rows = build([a('rack', { floorId: 'f1' }), a('dev', { parentAssetId: 'rack', col: 0, row: 0 })]);
    expect(rows.every((r) => r.assemblyRootId === null)).toBe(true);
  });

  it('상위가 순환해도 멈춘다 — 데이터가 망가져도 표가 얼지 않게', () => {
    expect(() => build([a('x', { parentAssetId: 'y' }), a('y', { parentAssetId: 'x' })])).not.toThrow();
  });
});
