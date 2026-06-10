import { describe, it, expect } from 'vitest';
import { buildSubstationCommitPayload } from './substationCommit';
import { emptyOverlay, stageCreate, stageUpdate, stageDelete } from './overlay';
import type { Asset } from '../../types/asset';
import type { Overlay } from './overlay';

// saved: a RACK asset r1 (so a child referencing it is a rack module)
const savedAssets = [
  { id: 'r1', name: '랙', assetType: { placementKind: 'RACK' }, parentAssetId: null, slotIndex: null },
  // saved rack-module child m1 (for update/delete classification via savedAssets lookup)
  { id: 'm1', name: '기존모듈', assetType: { placementKind: null }, parentAssetId: 'r1', slotIndex: 2, slotSpan: 1, assetTypeId: 'tMOD' },
  // saved placement-level OFD a1
  { id: 'a1', name: '기존OFD', assetType: { placementKind: 'OFD' }, parentAssetId: null, slotIndex: null, floorId: 'f1' },
  // saved rack-module m2 + placement a2 — used for delete classification
  { id: 'm2', name: '모듈2', assetType: { placementKind: null }, parentAssetId: 'r1', slotIndex: 5, slotSpan: 1, assetTypeId: 'tMOD' },
  { id: 'a2', name: 'OFD2', assetType: { placementKind: 'OFD' }, parentAssetId: null, slotIndex: null, floorId: 'f1' },
];

type AnyOverlay = Overlay<Asset, Partial<Asset>>;
const ov = () => emptyOverlay<Asset, Partial<Asset>>();

describe('buildSubstationCommitPayload', () => {
  it('assets overlay 를 placement-level / rackModules 로 분리', () => {
    let assets: AnyOverlay = ov();
    // (a) placement-level OFD create
    assets = stageCreate(assets, 'tmpO', {
      id: 'tmpO', assetTypeId: 'tOFD', name: 'OFD', floorId: 'f1', positionX: 5, positionY: 6,
      parentAssetId: null, slotIndex: null,
    } as any);
    // (b) rack-module child create (parent=r1 RACK, slotIndex set)
    assets = stageCreate(assets, 'tmpM', {
      id: 'tmpM', assetTypeId: 'tMOD', name: '모듈', parentAssetId: 'r1', slotIndex: 3, slotSpan: 1,
    } as any);

    const overlays = {
      assets, cables: ov() as any, fiberPaths: ov() as any,
    };
    const payload = buildSubstationCommitPayload(overlays as any, savedAssets as any);

    // placement-level OFD → payload.assets.creates ; rack module → payload.rackModules.creates
    expect(payload.assets!.creates.map((c: any) => c.tempId)).toContain('tmpO');
    expect(payload.assets!.creates.map((c: any) => c.tempId)).not.toContain('tmpM');

    const rm = payload.rackModules!.creates.find((c: any) => c.tempId === 'tmpM');
    expect(rm).toBeTruthy();
    expect(rm!.rackEquipmentId).toBe('r1'); // parentAssetId → rackEquipmentId
    expect(rm!.categoryId).toBe('tMOD'); // assetTypeId → categoryId
    expect(rm!.slotIndex).toBe(3);
    expect(rm!.slotSpan).toBe(1);

    // placement create keeps placement fields verbatim
    const ofd = payload.assets!.creates.find((c: any) => c.tempId === 'tmpO');
    expect(ofd!.floorId).toBe('f1');
    expect(ofd!.positionX).toBe(5);
  });

  it('update/delete 를 savedAssets lookup 으로 분류', () => {
    let assets: AnyOverlay = ov();
    // baseVersions needed for OCC token on update/delete
    assets.baseVersions = { m1: 'v-m1', a1: 'v-a1', m2: 'v-m2', a2: 'v-a2' };
    // update saved rack-module m1 → rackModules.updates with mapped patch keys
    assets = stageUpdate(assets, 'm1', { name: '모듈수정', attributes: { x: 1 }, slotSpan: 2 } as any);
    // update saved placement-level a1 → assets.updates verbatim
    assets = stageUpdate(assets, 'a1', { positionX: 99 } as any);
    // delete saved rack-module m2 + saved placement a2
    assets = stageDelete(assets, 'm2');
    assets = stageDelete(assets, 'a2');

    const overlays = {
      assets, cables: ov() as any, fiberPaths: ov() as any,
    };
    const payload = buildSubstationCommitPayload(overlays as any, savedAssets as any);

    // m1 update → rackModules, with renamed keys
    const rmUpd = payload.rackModules!.updates.find((u: any) => u.id === 'm1');
    expect(rmUpd).toBeTruthy();
    expect(rmUpd!.baseVersion).toBe('v-m1');
    expect((rmUpd!.patch as any).name).toBe('모듈수정');
    expect((rmUpd!.patch as any).properties).toEqual({ x: 1 }); // attributes → properties
    expect((rmUpd!.patch as any).slotSpan).toBe(2);

    // a1 update → assets verbatim
    const aUpd = payload.assets!.updates.find((u: any) => u.id === 'a1');
    expect(aUpd).toBeTruthy();
    expect((aUpd!.patch as any).positionX).toBe(99);

    // deletes routed correctly
    expect(payload.rackModules!.deletes.map((d: any) => d.id)).toContain('m2');
    expect(payload.assets!.deletes.map((d: any) => d.id)).toContain('a2');
  });

  it('cable create → tempId + 단일 sourceAssetId/targetAssetId, nested/flat 없음', () => {
    // 단계4b — CableSpecModal 이 stage 하는 정규 shape: id + 단일 assetId(nested 제거).
    const cables = stageCreate(emptyOverlay<any, any>(), 'tmpC', {
      id: 'tmpC',
      sourceAssetId: 'a1',
      targetAssetId: 'm1',
      cableType: 'LAN',
      categoryId: 'catX',
      pathPoints: [[0, 0], [10, 10]],
      pathLength: 14,
      bufferLength: 4,
      totalLength: 18,
    } as any);

    const overlays = {
      assets: ov() as any, cables: cables as any,
      distributionCircuits: ov() as any, fiberPaths: ov() as any,
    };
    const payload = buildSubstationCommitPayload(overlays as any, savedAssets as any);

    const c = payload.cables!.creates.find((x: any) => x.tempId === 'tmpC') as any;
    expect(c).toBeTruthy();
    // id → tempId (백엔드 cableCreate 요구)
    expect(c.tempId).toBe('tmpC');
    expect(c.id).toBeUndefined();
    // 단계4b — endpoint 는 단일 assetId 만. nested source/target 제거.
    expect(c.sourceAssetId).toBe('a1');
    expect(c.targetAssetId).toBe('m1');
    expect(c.source).toBeUndefined();
    expect(c.target).toBeUndefined();
    // flat denormalized keys 도 페이로드에 없어야 함
    expect(c.sourceEquipmentId).toBeUndefined();
    expect(c.targetEquipmentId).toBeUndefined();
    expect(c.sourceModuleId).toBeUndefined();
    expect(c.targetModuleId).toBeUndefined();
    // canonical passthrough
    expect(c.cableType).toBe('LAN');
    expect(c.categoryId).toBe('catX');
    expect(c.pathPoints).toEqual([[0, 0], [10, 10]]);
    expect(c.totalLength).toBe(18);
  });
});
