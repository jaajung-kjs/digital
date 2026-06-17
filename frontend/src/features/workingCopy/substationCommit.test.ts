import { describe, it, expect } from 'vitest';
import { buildSubstationCommitPayload } from './substationCommit';
import { emptyOverlay, stageCreate, stageUpdate, stageDelete } from './overlay';
import type { Asset } from '../../types/asset';
import type { Overlay } from './overlay';

type AnyOverlay = Overlay<Asset, Partial<Asset>>;
const ov = () => emptyOverlay<Asset, Partial<Asset>>();

describe('buildSubstationCommitPayload', () => {
  it('모든 하위 자산(랙 모듈 포함)을 단일 assets 컬렉션으로 — rackModules 분리 폐지', () => {
    let assets: AnyOverlay = ov();
    // (a) placement-level OFD create
    assets = stageCreate(assets, 'tmpO', {
      id: 'tmpO', assetTypeId: 'tOFD', name: 'OFD', floorId: 'f1', positionX: 5, positionY: 6,
      parentAssetId: null, slotIndex: null,
    } as any);
    // (b) 랙 모듈 자식 create (parent=r1 RACK, slotIndex 있음)
    assets = stageCreate(assets, 'tmpM', {
      id: 'tmpM', assetTypeId: 'tMOD', name: '모듈', parentAssetId: 'r1', slotIndex: 3, slotSpan: 1,
    } as any);

    const overlays = {
      assets, cables: ov() as any, records: ov() as any,
    };
    const payload = buildSubstationCommitPayload(overlays as any, [], new Map());

    // 분리 컬렉션 폐지 — rackModules 없음. 둘 다 assets.creates 로.
    expect(payload.rackModules).toBeUndefined();
    const ids = payload.assets!.creates.map((c: any) => c.tempId);
    expect(ids).toContain('tmpO');
    expect(ids).toContain('tmpM');

    // 랙 모듈은 Asset 필드 그대로(rackEquipmentId/categoryId 매핑 없음) + 슬롯 보존.
    const rm = payload.assets!.creates.find((c: any) => c.tempId === 'tmpM') as any;
    expect(rm.parentAssetId).toBe('r1');
    expect(rm.assetTypeId).toBe('tMOD');
    expect(rm.slotIndex).toBe(3);
    expect(rm.slotSpan).toBe(1);
    expect(rm.rackEquipmentId).toBeUndefined();
    expect(rm.categoryId).toBeUndefined();

    // placement create 는 placement 필드 그대로.
    const ofd = payload.assets!.creates.find((c: any) => c.tempId === 'tmpO') as any;
    expect(ofd.floorId).toBe('f1');
    expect(ofd.positionX).toBe(5);
  });

  it('update/delete — 모든 하위 자산이 assets 컬렉션으로(분류 없음), patch raw 통과', () => {
    let assets: AnyOverlay = ov();
    assets.baseVersions = { m1: 'v-m1', a1: 'v-a1', m2: 'v-m2', a2: 'v-a2' };
    // 랙 모듈 m1 update → assets.updates, 키 매핑 없이 raw(sourcePresetId 그대로, properties 아님)
    assets = stageUpdate(assets, 'm1', { name: '모듈수정', sourcePresetId: 'p1', slotSpan: 2 } as any);
    assets = stageUpdate(assets, 'a1', { positionX: 99 } as any);
    assets = stageDelete(assets, 'm2');
    assets = stageDelete(assets, 'a2');

    const overlays = {
      assets, cables: ov() as any, records: ov() as any,
    };
    const payload = buildSubstationCommitPayload(overlays as any, [], new Map());

    expect(payload.rackModules).toBeUndefined();

    const mUpd = payload.assets!.updates.find((u: any) => u.id === 'm1') as any;
    expect(mUpd).toBeTruthy();
    expect(mUpd.baseVersion).toBe('v-m1');
    expect(mUpd.patch.name).toBe('모듈수정');
    expect(mUpd.patch.sourcePresetId).toBe('p1'); // raw — properties 매핑 없음
    expect(mUpd.patch.properties).toBeUndefined();
    expect(mUpd.patch.slotSpan).toBe(2);

    const aUpd = payload.assets!.updates.find((u: any) => u.id === 'a1') as any;
    expect(aUpd.patch.positionX).toBe(99);

    // deletes 모두 assets.deletes
    const delIds = payload.assets!.deletes.map((d: any) => d.id);
    expect(delIds).toContain('m2');
    expect(delIds).toContain('a2');
  });

  it('status 패치: 비모듈·랙 모듈 모두 assets.updates 에 status 포함(드롭 안 됨)', () => {
    let assets: AnyOverlay = ov();
    assets.baseVersions = { a1: 'v-a1', m1: 'v-m1' };
    assets = stageUpdate(assets, 'a1', { status: 'OFF' } as any); // 비모듈
    assets = stageUpdate(assets, 'm1', { status: 'OFF' } as any); // 랙 모듈
    const payload = buildSubstationCommitPayload(
      { assets, cables: ov() as any, records: ov() as any } as any,
      [], new Map(),
    );
    expect((payload.assets!.updates.find((u: any) => u.id === 'a1')!.patch as any).status).toBe('OFF');
    expect((payload.assets!.updates.find((u: any) => u.id === 'm1')!.patch as any).status).toBe('OFF');
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
      distributionCircuits: ov() as any, records: ov() as any,
    };
    const payload = buildSubstationCommitPayload(overlays as any, [], new Map());

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

  it('조직 4컬렉션 델타를 페이로드에 포함 — create(id→tempId, 허용 필드)/update/delete', () => {
    // headquarters create
    const headquarters = stageCreate(emptyOverlay<any, any>(), 'tmpHQ', {
      id: 'tmpHQ', name: '본부', sortOrder: 1, junk: 'drop',
    } as any);
    // branch create — 부모 FK 는 같은 커밋의 staged tempId(그대로 통과)
    const branches = stageCreate(emptyOverlay<any, any>(), 'tmpBR', {
      id: 'tmpBR', name: '지사', headquartersId: 'tmpHQ', sortOrder: 2,
    } as any);
    // substation update + delete
    let substations = emptyOverlay<any, any>();
    substations.baseVersions = { s1: 'v-s1', s2: 'v-s2' };
    substations = stageUpdate(substations, 's1', { name: '변전소수정', address: '서울' } as any);
    substations = stageDelete(substations, 's2');
    // floor create — substationId FK + floorNumber
    const floors = stageCreate(emptyOverlay<any, any>(), 'tmpFL', {
      id: 'tmpFL', name: 'B1', substationId: 's1', floorNumber: 'B1', sortOrder: 0,
    } as any);

    const overlays = {
      assets: ov() as any, cables: ov() as any, records: ov() as any,
      headquarters, branches, substations, floors,
    };
    const payload = buildSubstationCommitPayload(overlays as any, [], new Map());

    // headquarters create — id→tempId, 허용 필드만(junk 제거)
    const hq = payload.headquarters!.creates.find((x: any) => x.tempId === 'tmpHQ') as any;
    expect(hq).toBeTruthy();
    expect(hq.id).toBeUndefined();
    expect(hq.name).toBe('본부');
    expect(hq.sortOrder).toBe(1);
    expect(hq.junk).toBeUndefined();

    // branch create — 부모 FK(staged tempId) 그대로
    const br = payload.branches!.creates.find((x: any) => x.tempId === 'tmpBR') as any;
    expect(br.headquartersId).toBe('tmpHQ');
    expect(br.name).toBe('지사');

    // substation update/delete — baseVersion OCC + patch raw
    const sUpd = payload.substations!.updates.find((u: any) => u.id === 's1') as any;
    expect(sUpd.baseVersion).toBe('v-s1');
    expect(sUpd.patch.name).toBe('변전소수정');
    expect(sUpd.patch.address).toBe('서울');
    const sDel = payload.substations!.deletes.find((d: any) => d.id === 's2') as any;
    expect(sDel.baseVersion).toBe('v-s2');

    // floor create — substationId FK + floorNumber
    const fl = payload.floors!.creates.find((x: any) => x.tempId === 'tmpFL') as any;
    expect(fl.substationId).toBe('s1');
    expect(fl.floorNumber).toBe('B1');
  });

  it('조직 overlay 가 비면 페이로드에서 키 생략', () => {
    const payload = buildSubstationCommitPayload(
      { assets: ov() as any, cables: ov() as any, records: ov() as any } as any,
      [], new Map(),
    );
    expect(payload.headquarters).toBeUndefined();
    expect(payload.branches).toBeUndefined();
    expect(payload.substations).toBeUndefined();
    expect(payload.floors).toBeUndefined();
  });
});
