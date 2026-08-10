import { describe, expect, it } from 'vitest';
import type { V2Asset, V2AssetPhoto, V2Cable, V2MaintenanceLog } from '../../types';
import { emptyOverlay, type Overlay } from '../overlay';
import { buildCommitPayload } from '../buildCommitPayload';
import { isoToLocalInput } from '../../components/RecordsTab';

const baseAsset: V2Asset = {
  id: 'a-1', name: '자산', typeId: 't-1', substationId: 's-1', status: 'normal',
  floorId: null, x: null, y: null, width: null, height: null,
  parentAssetId: null, containerKey: null, col: null, row: null, colSpan: null, rowSpan: null,
  fieldValues: {}, updatedAt: '2026-07-27T00:00:00.000Z', ports: [],
};

function overlays(partial: { assets?: Partial<Overlay<V2Asset>>; maintenance?: Partial<Overlay<V2MaintenanceLog>>; cables?: Partial<Overlay<V2Cable>>; photos?: Partial<Overlay<V2AssetPhoto>> }) {
  return {
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
      { assets: emptyOverlay(), maintenance: emptyOverlay(), inspections: emptyOverlay(), photos: emptyOverlay(),
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
    expect(p.records).toEqual({ photos: { creates: [{ id: 'ph-1', assetId: 'a-1', filePath: 'assets/x.png', caption: null }] } });
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
