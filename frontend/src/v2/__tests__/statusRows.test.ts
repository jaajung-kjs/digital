import { describe, expect, it } from 'vitest';
import { buildStatusRows } from '../statusRows';
import { emptyOverlay, mergeEffective, stageCreate } from '../store/overlay';
import type { V2Asset } from '../types';

/* 설치일·담당자는 타입이 선언하지 않는다 — 모든 자산이 갖는 기본이다(`assetFieldDefs`). */
const types = new Map([
  ['t-rack', { id: 't-rack', name: '랙', categoryId: 'c-1', fieldDefs: [] } as never],
]);
const categories = new Map([['c-1', '구조']]);

describe('buildStatusRows (변전소 스코프)', () => {
  const floors = [{ id: 'f-1', name: '1층', sortOrder: 1, substationId: 's' }];
  const rack = { id: 'a-1', name: '랙1', typeId: 't-rack', status: 'normal', floorId: 'f-1', parentAssetId: null, containerKey: null, slotIndex: null, fieldValues: { installDate: '2026-01-01', manager: '홍길동' } };
  const mod = { id: 'a-2', name: '모듈', typeId: 't-rack', status: 'fault', floorId: null, parentAssetId: 'a-1', containerKey: 'main', slotIndex: 3, fieldValues: {} };
  const unplaced = { id: 'a-3', name: '미배치자산', typeId: 't-rack', status: 'standby', floorId: null, parentAssetId: null, containerKey: null, slotIndex: null, fieldValues: {} };

  it('층 배치·컨테이너 배치·미배치 location + 필드·최근점검 계산', () => {
    const { rows } = buildStatusRows({
      assets: [rack, mod, unplaced] as never,
      floors: floors as never,
      typesById: types,
      categoryNameById: categories,
      inspectionsByAsset: new Map([['a-1', ['2026-06-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z']]]),
    });
    expect(rows[0]).toMatchObject({ id: 'a-1', typeName: '랙', location: '1층', lastInspectedAt: '2026-07-01T00:00:00.000Z', status: 'normal' });
    expect(rows[0]?.fieldValues).toMatchObject({ installDate: '2026-01-01', manager: '홍길동' });
    // 위치는 층까지 거슬러 올라간다 — 예전에는 '랙1 · 슬롯 4' 라서 몇 층인지 알 수 없었다.
    expect(rows[1]).toMatchObject({ id: 'a-2', location: '1층 · 랙1 · 슬롯 4', lastInspectedAt: null });
    expect(rows[2]).toMatchObject({ id: 'a-3', location: '미배치', status: 'standby', lastInspectedAt: null });
  });

  it('overlay에 스테이지된 자산 create가 mergeEffective→buildStatusRows 경로로 행에 포함된다', () => {
    const saved = [rack] as unknown as V2Asset[];
    const staged = { id: 'tmp-1', name: '신규자산', typeId: 't-rack', status: 'normal', floorId: 'f-1', parentAssetId: null, containerKey: null, slotIndex: null, fieldValues: {} } as unknown as V2Asset;
    const overlay = stageCreate(emptyOverlay<V2Asset>(), staged.id, staged);

    const { rows } = buildStatusRows({
      assets: mergeEffective(saved, overlay),
      floors: floors as never,
      typesById: types,
      categoryNameById: categories,
      inspectionsByAsset: new Map(),
    });

    expect(rows.map((r) => r.id)).toEqual(['a-1', 'tmp-1']);
    expect(rows[1]).toMatchObject({ id: 'tmp-1', name: '신규자산', typeName: '랙', location: '1층', status: 'normal' });
  });
});

/* 자산이 갖는 속성은 종류를 가리지 않고 같다. 화면이 `installDate`·`manager` 라는 키를
   직접 알지 않도록 선언에서 받아 온다. */
describe('필드 열 도출', () => {
  const t = (id: string) => [id, { id, name: id, categoryId: 'c-1' } as never] as const;
  const a = (id: string, typeId: string) =>
    ({ id, name: id, typeId, status: 'normal', floorId: null, parentAssetId: null,
       containerKey: null, slotIndex: null, fieldValues: {} });
  const build = (assets: object[], typesById: Map<string, never>) =>
    buildStatusRows({
      assets: assets as never, floors: [] as never, typesById,
      categoryNameById: new Map(), inspectionsByAsset: new Map(),
    }).fieldColumns.map((f) => f.key);

  it('타입이 섞여도 열은 같다 — 자산 속성은 종류를 가리지 않는다', () => {
    const typesById = new Map([t('A'), t('B')]);
    expect(build([a('1', 'A'), a('2', 'B')], typesById as never)).toEqual(['installDate', 'manager']);
  });
});
