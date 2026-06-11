import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../utils/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
import { api } from '../../utils/api';
import { useSubstationWorkingCopy } from './substationStore';
import { cableOnFloor, assetsByIdMap } from './floorAnchor';
import { kindOf } from './placement';

const rack = { id:'r1', name:'랙', substationId:'s1', floorId:'f1', assetType:{ placementKind:'RACK' }, positionX:10, positionY:20, width2d:100, height2d:200, totalU:42, parentAssetId:null, slotIndex:null, updatedAt:'2026-01-01T00:00:00.000Z' };
const mod = { id:'m1', name:'모듈', substationId:'s1', floorId:'f1', assetType:{ placementKind:null }, parentAssetId:'r1', slotIndex:3, slotSpan:1, updatedAt:'2026-01-01T00:00:00.000Z' };
const ofd = { id:'o1', name:'OFD', substationId:'s1', floorId:'f1', assetType:{ placementKind:'OFD' }, positionX:5, positionY:5, width2d:40, height2d:60, parentAssetId:null, slotIndex:null, updatedAt:'2026-01-01T00:00:00.000Z' };
const cable = { id:'c1', sourceAssetId:'r1', targetAssetId:'o1', source:{ equipmentId:'r1', moduleId:null }, target:{ equipmentId:'o1', moduleId:null }, cableType:'LAN', updatedAt:'2026-01-01T00:00:00.000Z' };

beforeEach(() => { (api.get as any).mockResolvedValue({ data: { data: { assets:[rack,mod,ofd], cables:[cable], fiberPaths:[] } } }); });

describe('substationWorkingCopy', () => {
  it('load → effective = saved, dirty 0', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    const s = useSubstationWorkingCopy.getState();
    expect(s.effectiveAssets().length).toBe(3);
    expect(s.dirtyCount()).toBe(0);
  });
  it('stageAssetUpdate → effective 반영 + dirty 1', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    useSubstationWorkingCopy.getState().stageAssetUpdate('o1', { name: 'OFD-X' });
    const s = useSubstationWorkingCopy.getState();
    expect(s.effectiveAssets().find(a => a.id==='o1')!.name).toBe('OFD-X');
    expect(s.dirtyCount()).toBe(1);
  });
  it('effectiveTopAssets 는 랙모듈 자식 제외; effectiveRackModules 는 그 자식', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    const s = useSubstationWorkingCopy.getState();
    expect(s.effectiveTopAssets().map(a=>a.id).sort()).toEqual(['o1','r1']);  // m1(랙모듈) 제외
    expect(s.effectiveRackModules('r1').map(a=>a.id)).toEqual(['m1']);
  });
  it('effectiveEquipment(floor) → Asset[]', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    const eq = useSubstationWorkingCopy.getState().effectiveEquipment('f1');
    expect(eq.map(e=>e.id).sort()).toEqual(['o1','r1']);
    expect(kindOf(eq.find(e=>e.id==='r1')!)).toBe('RACK');
  });
  it('revert → dirty 0', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    useSubstationWorkingCopy.getState().stageAssetUpdate('o1', { name:'X' });
    useSubstationWorkingCopy.getState().revert();
    expect(useSubstationWorkingCopy.getState().dirtyCount()).toBe(0);
  });
  it('stageAssetUpdate → undo → dirty 0 (zundo history = overlays)', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    useSubstationWorkingCopy.getState().stageAssetUpdate('o1', { name:'OFD-Y' });
    expect(useSubstationWorkingCopy.getState().dirtyCount()).toBe(1);
    useSubstationWorkingCopy.temporal.getState().undo();
    expect(useSubstationWorkingCopy.getState().dirtyCount()).toBe(0);
  });

  // ── 2d-1 T3: 에디터 대면 mutation 액션 ──
  it('stageEquipmentCreate → effective 신규 설비', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    const eq = { id:'tmpX', kind:'OFD', name:'새OFD', positionX:1, positionY:2, width:10, height:10, floorId:'f1' } as any;
    useSubstationWorkingCopy.getState().stageEquipmentCreate(eq, 'tOFD');
    expect(useSubstationWorkingCopy.getState().effectiveAssets().some(a => a.id==='tmpX')).toBe(true);
  });
  it('stageAssetUpdate → 위치 반영', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    useSubstationWorkingCopy.getState().stageAssetUpdate('o1', { positionX: 99 });
    expect(useSubstationWorkingCopy.getState().effectiveAssets().find(a=>a.id==='o1')!.positionX).toBe(99);
  });
  it('stageEquipmentDeleteCascade → 설비+랙모듈자식+케이블 delete, undo 1스텝', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    useSubstationWorkingCopy.getState().stageEquipmentDeleteCascade('r1');
    const ids = useSubstationWorkingCopy.getState().effectiveAssets().map(a=>a.id);
    expect(ids).not.toContain('r1');
    expect(ids).not.toContain('m1');  // rack-module child cascaded
    expect(useSubstationWorkingCopy.getState().effectiveCables().some(c=>c.id==='c1')).toBe(false); // cable to r1 cascaded
    useSubstationWorkingCopy.temporal.getState().undo();  // single undo restores all
    const ids2 = useSubstationWorkingCopy.getState().effectiveAssets().map(a=>a.id);
    expect(ids2).toContain('r1'); expect(ids2).toContain('m1');
    expect(useSubstationWorkingCopy.getState().effectiveCables().some(c=>c.id==='c1')).toBe(true);
  });
  it('stageCableUpdates 다건 한 번에', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    useSubstationWorkingCopy.getState().stageCableUpdates({ c1: { label: 'L' } });
    expect(useSubstationWorkingCopy.getState().effectiveCables().find(c=>c.id==='c1')!.label).toBe('L');
  });
  it('stageCableCreate(단일 assetId, 모듈 endpoint) → cableOnFloor 로 포함(렌더됨)', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    // 단계3a — CableSpecModal 이 stage 하는 shape: 모듈(m1) endpoint = sourceAssetId.
    useSubstationWorkingCopy.getState().stageCableCreate({
      id: 'tmpC',
      sourceAssetId: 'm1',
      targetAssetId: 'o1',
      source: { equipmentId: null, moduleId: 'm1', circuitId: null },
      target: { equipmentId: 'o1', moduleId: null, circuitId: null },
      cableType: 'LAN',
      pathPoints: [[10, 20], [5, 5]],
    } as any);
    const eff = useSubstationWorkingCopy.getState().effectiveCables();
    const created = eff.find((c) => c.id === 'tmpC') as any;
    expect(created).toBeTruthy();
    // 단일 assetId(m1)→floorAnchor→r1(f1) 로 해소 ⇒ 이 층 멤버.
    const assetsById = assetsByIdMap(
      useSubstationWorkingCopy.getState().effectiveAssets() as any,
    );
    expect(cableOnFloor(created, 'f1', assetsById)).toBe(true);
  });

  // ── 2d-2 T1: 랙모듈(=RACK 자식 Asset) stage 액션 ──
  it('stageRackModuleCreate → effectiveAssets/effectiveRackModules 에 자식 추가(부모 floor 상속)', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    const m = { id:'tm1', rackEquipmentId:'r1', categoryId:'cat1', name:'새모듈', slotIndex:7, slotSpan:1, properties:{x:1} } as any;
    useSubstationWorkingCopy.getState().stageRackModuleCreate(m);
    const s = useSubstationWorkingCopy.getState();
    const created = s.effectiveAssets().find(a=>a.id==='tm1')!;
    expect(created).toBeTruthy();
    expect(created.parentAssetId).toBe('r1');
    expect(created.floorId).toBe('f1');  // 부모 랙 r1 의 floor 상속
    expect(s.effectiveRackModules('r1').map(a=>a.id).sort()).toEqual(['m1','tm1']);
  });
  it('stageRackModuleUpdate → slotIndex 이동 반영', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    const m = { id:'tm1', rackEquipmentId:'r1', categoryId:'cat1', name:'새모듈', slotIndex:7, slotSpan:1 } as any;
    useSubstationWorkingCopy.getState().stageRackModuleCreate(m);
    useSubstationWorkingCopy.getState().stageRackModuleUpdate('tm1', { slotIndex:5 });
    expect(useSubstationWorkingCopy.getState().effectiveAssets().find(a=>a.id==='tm1')!.slotIndex).toBe(5);
  });
  it('stageRackModuleDelete → effective 에서 제거', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    useSubstationWorkingCopy.getState().stageRackModuleDelete('m1');
    expect(useSubstationWorkingCopy.getState().effectiveRackModules('r1').map(a=>a.id)).toEqual([]);
  });

  // ── SSOT-2d-3a T1: 버전 복원 diff 스테이징(단일 undo) ──
  it('stageReplaceFloorFromSnapshot → diff stage, 단일 undo', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    // snapshot: r1 modified(name X), a3 new, ofd o1 / mod m1 absent; cables empty
    const minimalAsset = { substationId:'s1', assetTypeId:'tRACK', assetType:{ id:'tRACK', code:'RACK', name:'랙', group:null, displayColor:null, fieldTemplate:null, placementKind:'RACK' }, name:'a3', parentAssetId:null, floorId:'f1', roomText:null, attributes:null, installDate:null, warrantyUntil:null, replaceDue:null, manager:null, description:null, status:null, sortOrder:0, updatedAt:'2026-01-01T00:00:00.000Z' };
    useSubstationWorkingCopy.getState().stageReplaceFloorFromSnapshot('f1', {
      assets: [{ ...(rack as any), name:'X' }, { id:'a3', ...minimalAsset } as any],
      cables: [],
    });
    const eff = useSubstationWorkingCopy.getState();
    const ids = eff.effectiveAssets().map(a=>a.id);
    expect(eff.effectiveAssets().find(a=>a.id==='r1')!.name).toBe('X'); // updated
    expect(ids).toContain('a3');     // created
    expect(ids).not.toContain('o1'); // deleted (absent from snapshot)
    expect(ids).not.toContain('m1'); // rack-module child on floor, absent → deleted
    expect(eff.effectiveCables().some(c=>c.id==='c1')).toBe(false); // cable deleted (snapshot cables empty)
    useSubstationWorkingCopy.temporal.getState().undo(); // single step restores all
    const ids2 = useSubstationWorkingCopy.getState().effectiveAssets().map(a=>a.id);
    expect(ids2).toContain('o1');
    expect(ids2).toContain('m1');
    expect(useSubstationWorkingCopy.getState().effectiveCables().some(c=>c.id==='c1')).toBe(true); // c1 back
  });
});
