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

/* 표의 커스텀 필드 열은 **타입 선언**에서 나온다. 예전에는 화면이 `installDate`·`manager`
   라는 키를 직접 알아서, 라벨을 바꾸면 머리글만 옛 이름으로 남고 새 필드는 영영 안 나왔다. */
describe('필드 열 도출', () => {
  const t = (id: string, fieldDefs: object[]) =>
    [id, { id, name: id, categoryId: 'c-1', fieldDefs } as never] as const;
  const a = (id: string, typeId: string) =>
    ({ id, name: id, typeId, status: 'normal', floorId: null, parentAssetId: null,
       containerKey: null, slotIndex: null, fieldValues: {} });
  const build = (assets: object[], typesById: Map<string, never>) =>
    buildStatusRows({
      assets: assets as never, floors: [] as never, typesById,
      categoryNameById: new Map(), inspectionsByAsset: new Map(),
    }).fieldColumns.map((f) => f.key);

  it('모든 타입이 선언한 필드만 열이 된다', () => {
    const typesById = new Map([t('A', []), t('B', [{ key: 'breakerNo', label: '차단기 번호', type: 'text' }])]);
    expect(build([a('1', 'A'), a('2', 'B')], typesById as never)).toEqual(['installDate', 'manager']);
  });

  it('한 타입만 담긴 표에서는 그 타입의 필드가 전부 열이 된다', () => {
    const typesById = new Map([t('A', []), t('B', [{ key: 'breakerNo', label: '차단기 번호', type: 'text' }])]);
    expect(build([a('2', 'B')], typesById as never)).toEqual(['installDate', 'manager', 'breakerNo']);
  });

  it('라벨은 선언에서 온다 — 카탈로그에서 이름을 바꾸면 머리글이 따라온다', () => {
    const typesById = new Map([t('A', [{ key: 'model', label: '모델', type: 'text' }])]);
    const out = buildStatusRows({
      assets: [a('1', 'A')] as never, floors: [] as never, typesById: typesById as never,
      categoryNameById: new Map(), inspectionsByAsset: new Map(),
    });
    expect(out.fieldColumns.find((f) => f.key === 'model')?.label).toBe('모델');
  });

  /* 설치일·담당자는 타입이 선언하지 않아도 모든 자산이 갖는다 — 그래서 언제나 열이 된다.
     타입 고유 필드만 교집합으로 걸러진다. */
  it('타입 고유 필드가 서로 다르면 공통 필드만 남는다', () => {
    const typesById = new Map([t('A', [{ key: 'x', label: 'X', type: 'text' }]), t('B', [{ key: 'y', label: 'Y', type: 'text' }])]);
    expect(build([a('1', 'A'), a('2', 'B')], typesById as never)).toEqual(['installDate', 'manager']);
  });
});
