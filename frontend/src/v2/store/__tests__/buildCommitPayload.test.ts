import { describe, expect, it } from 'vitest';
import type { V2Asset, V2AssetPhoto, V2Cable, V2Floor, V2MaintenanceLog } from '../../types';
import { emptyOverlay, type Overlay } from '../overlay';
import { buildCommitPayload } from '../buildCommitPayload';
import { isoToLocalInput } from '../../components/detail/RecordsTab';

const baseAsset: V2Asset = {
  id: 'a-1', name: '자산', typeId: 't-1', substationId: 's-1', status: 'normal',
  floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, containerKey: null, col: null, row: null, colSpan: null, rowSpan: null,
  fieldValues: {}, updatedAt: '2026-07-27T00:00:00.000Z', ports: [],
};

function overlays(partial: { floors?: Partial<Overlay<V2Floor>>; assets?: Partial<Overlay<V2Asset>>; maintenance?: Partial<Overlay<V2MaintenanceLog>>; cables?: Partial<Overlay<V2Cable>>; photos?: Partial<Overlay<V2AssetPhoto>> }) {
  return {
    floors: { ...emptyOverlay<V2Floor>(), ...partial.floors },
    assets: { ...emptyOverlay<V2Asset>(), ...partial.assets },
    maintenance: { ...emptyOverlay<V2MaintenanceLog>(), ...partial.maintenance },
    inspections: emptyOverlay<never>(),
    cables: { ...emptyOverlay<V2Cable>(), ...partial.cables },
    photos: { ...emptyOverlay<V2AssetPhoto>(), ...partial.photos },
  };
}

describe('buildCommitPayload', () => {
  it('create에서 서버 파생 필드(ports/updatedAt/substationId) 제외', () => {
    const p = buildCommitPayload(overlays({ assets: { creates: { 'a-1': baseAsset } } }), {});
    const c = p.assets!.creates![0]! as Record<string, unknown>;
    expect(c.id).toBe('a-1');
    expect('ports' in c).toBe(false);
    expect('updatedAt' in c).toBe(false);
    expect('substationId' in c).toBe(false);
  });

  /**
   * 포트 패치는 **값과 이름을 함께** 나른다.
   *
   * 화면은 포트를 고칠 때 배열째로 스테이지한다(그래야 effective 가 곧바로 새 값을 보여
   * 준다). 서버는 포트를 만들거나 지우지 않으므로 여기서 고칠 것만 뽑아 담는다 — 한때 값만
   * 뽑고 이름은 흘렸다. 현장 대장은 회로를 실물 라벨(`NFB#11`)로 부르는데, 화면에서 고쳐도
   * 저장하면 「분기 2」로 돌아왔다.
   */
  it('포트 패치에 값과 이름이 함께 실린다', () => {
    const ports = [{ id: 'p-1', assetId: 'a-1', group: 'OUT', index: 1, name: 'NFB#11',
                     direction: 'OUT', medium: 'power', positions: 1, variant: 'AC',
                     fieldValues: { ampere: 30 } }] as unknown as V2Asset['ports'];
    const p = buildCommitPayload(overlays({ assets: { updates: { 'a-1': { ports } } } }), {});
    const patch = p.assets!.updates![0]!.patch as Record<string, unknown>;
    expect(patch.portPatches).toEqual([{ portId: 'p-1', fieldValues: { ampere: 30 }, name: 'NFB#11' }]);
    /* 포트 배열 자체는 안 보낸다 — 서버가 만들거나 지우는 것이 아니다. */
    expect('ports' in patch).toBe(false);
  });

  it('baseVersions는 updates+deletes 대상만', () => {
    const p = buildCommitPayload(
      overlays({ assets: { updates: { 'a-1': { name: 'x' } }, deletes: ['a-2'] } }),
      { 'a-1': 'v1', 'a-2': 'v2', 'a-3': 'v3' },
    );
    expect(p.baseVersions).toEqual({ 'a-1': 'v1', 'a-2': 'v2' });
  });

  it('삭제 자산의 레코드 delete/update/create는 드랍 (cascade 계약)', () => {
    const log: V2MaintenanceLog = { id: 'm-1', assetId: 'a-del', occurredAt: 'x', content: 'c', action: null, updatedAt: 'v' };
    const p = buildCommitPayload(
      overlays({
        assets: { deletes: ['a-del'] },
        maintenance: { deletes: ['m-1'], creates: { 'm-2': { ...log, id: 'm-2' } }, updates: { 'm-1': { content: 'y' } } },
      }),
      { 'a-del': 'v' },
      { 'm-1': 'a-del' },
    );
    expect(p.records?.maintenance).toBeUndefined();
  });

  it('삭제 자산 판정은 saved 레코드의 assetId 로 한다 — 무관 레코드는 유지', () => {
    const keep: V2MaintenanceLog = { id: 'm-keep', assetId: 'a-live', occurredAt: 'x', content: 'c', action: null, updatedAt: 'v' };
    const p = buildCommitPayload(
      overlays({ assets: { deletes: ['a-del'] }, maintenance: { creates: { 'm-keep': keep } } }),
      { 'a-del': 'v' },
    );
    expect(p.records!.maintenance!.creates).toHaveLength(1);
  });

  it('빈 오버레이 → {}', () => {
    expect(buildCommitPayload(overlays({}), {})).toEqual({});
  });

  it('삭제된 자산 id 에 대한 update 엔트리는 드랍', () => {
    const p = buildCommitPayload(
      overlays({ assets: { updates: { 'a-del': { name: '수정됨' }, 'a-live': { name: '유지' } }, deletes: ['a-del'] } }),
      { 'a-del': 'v1', 'a-live': 'v2' },
    );
    const updateIds = (p.assets?.updates ?? []).map((u) => u.id);
    expect(updateIds).not.toContain('a-del');
    expect(updateIds).toContain('a-live');
  });

  it('정비 이력 create 에 ISO 날짜가 그대로 통과 (occurredAt ISO 계약)', () => {
    const iso = '2026-07-25T10:00:00.000Z';
    const log: V2MaintenanceLog = {
      id: 'm-iso', assetId: 'a-1', occurredAt: iso, content: '테스트', action: null, updatedAt: '',
    };
    const p = buildCommitPayload(
      overlays({ maintenance: { creates: { 'm-iso': log } } }),
      {},
    );
    const created = p.records?.maintenance?.creates?.[0] as Record<string, unknown> | undefined;
    expect(created?.occurredAt).toBe(iso);
  });

  it('cables: create 서버필드 제외 + baseVersions는 updates/deletes만 + 삭제 케이블 update 드랍', () => {
    const cable = { id: 'c-1', name: null, substationId: 's', aPortId: 'pa', bPortId: 'pb', categoryId: 'cat', pathPoints: [], specParams: {}, updatedAt: 'v' };
    const p = buildCommitPayload(
      { floors: emptyOverlay(), assets: emptyOverlay(), maintenance: emptyOverlay(), inspections: emptyOverlay(), photos: emptyOverlay(),
        cables: { creates: { 'c-1': cable }, updates: { 'c-2': { pathPoints: [{ x: 1, y: 2 }] }, 'c-3': { name: 'x' } }, deletes: ['c-3'] } },
      { 'c-2': 'v2', 'c-3': 'v3' },
    );
    const c = p.cables!.creates![0]! as Record<string, unknown>;
    expect('substationId' in c).toBe(false);
    expect('updatedAt' in c).toBe(false);
    expect(p.cables!.updates).toEqual([{ id: 'c-2', patch: { pathPoints: [{ x: 1, y: 2 }] } }]);
    expect(p.cables!.deletes).toEqual(['c-3']);
    expect(p.baseVersions).toEqual({ 'c-2': 'v2', 'c-3': 'v3' });
  });

  it('photos만 있을 때 records.photos 로 매핑되고 다른 키는 생략', () => {
    const ph: V2AssetPhoto = { id: 'ph-1', assetId: 'a-1', filePath: 'assets/x.png', caption: null, updatedAt: '' };
    const p = buildCommitPayload(overlays({ photos: { creates: { 'ph-1': ph } } }), {});
    /* 기록의 주인은 설비(`assetId`)이고 `partAssetId` 는 그 안에서 가리키는 장비다 —
       설비 전체에 대한 것이면 비운다. */
    expect(p.records).toEqual({
      /* 경로는 보내지 않는다 — 파일이 저장 요청에 함께 가고 서버가 지어 준다. */
      photos: { creates: [{ id: 'ph-1', assetId: 'a-1', partAssetId: null, caption: null }] },
    });
    expect(p.assets).toBeUndefined();
    expect(p.cables).toBeUndefined();
  });
});

describe('isoToLocalInput', () => {
  it('ISO → datetime-local 포맷(yyyy-MM-ddTHH:mm) 변환', () => {
    const result = isoToLocalInput('2026-07-25T10:00:00.000Z');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('반환값은 정확히 16자', () => {
    expect(isoToLocalInput('2026-07-25T10:00:00.000Z')).toHaveLength(16);
  });
});

/**
 * 층도 같은 채널로 나간다 — **저장해야 서버로 간다**.
 *
 * 예전에는 층만 즉시 쓰기라 이 페이로드에 실릴 것이 없었다. 그래서 한 화면에서 규칙이 둘
 * 돌았고, 그 경계마다 예외가 생겼다(저장 전에는 층을 못 지웠고 되돌리기도 안 들었다).
 */
describe('buildCommitPayload — 층', () => {
  const floor: V2Floor = { id: 'f-1', name: '지하1층', sortOrder: 3, substationId: 's-1', updatedAt: '' };

  it('만든 층은 이름·순서만 보낸다 — 변전소는 주소가 정한다', () => {
    const p = buildCommitPayload(overlays({ floors: { creates: { 'f-1': floor } } }), {});
    expect(p.floors!.creates).toEqual([{ id: 'f-1', name: '지하1층', sortOrder: 3 }]);
  });

  it('고친 층은 patch 로, 지운 층은 id 로 — baseVersions 는 그 둘만', () => {
    const p = buildCommitPayload(
      overlays({ floors: { updates: { 'f-2': { name: '2층' }, 'f-3': { backgroundOpacity: 0.3 } }, deletes: ['f-3'] } }),
      { 'f-1': 'v1', 'f-2': 'v2', 'f-3': 'v3' },
    );
    /* 지울 층의 update 는 실리지 않는다 — 자산·케이블과 같은 규칙. */
    expect(p.floors!.updates).toEqual([{ id: 'f-2', patch: { name: '2층' } }]);
    expect(p.floors!.deletes).toEqual(['f-3']);
    expect(p.baseVersions).toEqual({ 'f-2': 'v2', 'f-3': 'v3' });
  });

  it('배경 도면을 뗀 것도 그냥 patch 다 — null 이 「없앤다」는 뜻이다', () => {
    const p = buildCommitPayload(overlays({ floors: { updates: { 'f-1': { backgroundDrawing: null } } } }), {});
    expect(p.floors!.updates).toEqual([{ id: 'f-1', patch: { backgroundDrawing: null } }]);
  });
});
