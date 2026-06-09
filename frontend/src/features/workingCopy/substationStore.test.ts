import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../utils/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
import { api } from '../../utils/api';
import { useSubstationWorkingCopy } from './substationStore';

const rack = { id:'r1', name:'랙', substationId:'s1', floorId:'f1', assetType:{ placementKind:'RACK' }, positionX:10, positionY:20, width2d:100, height2d:200, totalU:42, parentAssetId:null, slotIndex:null, updatedAt:'2026-01-01T00:00:00.000Z' };
const mod = { id:'m1', name:'모듈', substationId:'s1', floorId:'f1', assetType:{ placementKind:null }, parentAssetId:'r1', slotIndex:3, slotSpan:1, updatedAt:'2026-01-01T00:00:00.000Z' };
const ofd = { id:'o1', name:'OFD', substationId:'s1', floorId:'f1', assetType:{ placementKind:'OFD' }, positionX:5, positionY:5, parentAssetId:null, slotIndex:null, updatedAt:'2026-01-01T00:00:00.000Z' };
const cable = { id:'c1', source:{}, target:{}, cableType:'LAN', updatedAt:'2026-01-01T00:00:00.000Z' };

beforeEach(() => { (api.get as any).mockResolvedValue({ data: { data: { assets:[rack,mod,ofd], cables:[cable], distributionCircuits:[], fiberPaths:[] } } }); });

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
  it('effectiveEquipment(floor) → FloorPlanEquipment[]', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    const eq = useSubstationWorkingCopy.getState().effectiveEquipment('f1');
    expect(eq.map(e=>e.id).sort()).toEqual(['o1','r1']);
    expect(eq.find(e=>e.id==='r1')!.kind).toBe('RACK');
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
});
