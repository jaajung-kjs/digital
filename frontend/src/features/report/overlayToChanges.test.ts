import { describe, it, expect } from 'vitest';
import { overlayToChanges } from './overlayToChanges';
import { emptyOverlay, stageCreate, stageUpdate, stageDelete } from '../workingCopy/overlay';
import type { Asset } from '../../types/asset';
import type { Overlay } from '../workingCopy/overlay';
import type { WorkingCopyRow } from '../workingCopy/substationStore';

const FLOOR = 'floor-1';

function asset(id: string, over: Partial<Asset> = {}): Asset {
  return {
    id,
    substationId: 'sub-1',
    assetTypeId: 'at-1',
    assetType: { id: 'at-1', code: 'RACK', name: '랙', group: null, displayColor: null, fieldTemplate: null },
    name: id,
    parentAssetId: null,
    floorId: FLOOR,
    roomText: null,
    attributes: null,
    installDate: null,
    warrantyUntil: null,
    replaceDue: null,
    manager: null,
    description: null,
    status: null,
    sortOrder: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    positionX: 10,
    positionY: 20,
    ...over,
  };
}

function emptyOverlays() {
  return {
    assets: emptyOverlay<Asset, Partial<Asset>>(),
    cables: emptyOverlay<WorkingCopyRow, Partial<WorkingCopyRow>>() as Overlay<WorkingCopyRow, Partial<WorkingCopyRow>>,
  };
}

describe('overlayToChanges', () => {
  it('created equipment → after only, not before', () => {
    const saved = { assets: [] as Asset[], cables: [] as WorkingCopyRow[] };
    const overlays = emptyOverlays();
    const newAsset = asset('temp-1');
    overlays.assets = stageCreate(overlays.assets, newAsset.id, newAsset);

    const { before, after } = overlayToChanges(saved, overlays, FLOOR);
    expect(before.equipment.map((e) => e.id)).not.toContain('temp-1');
    expect(after.equipment.map((e) => e.id)).toContain('temp-1');
    const item = after.equipment.find((e) => e.id === 'temp-1');
    expect(item?.materialCategoryCode).toBe('RACK');
    // 백엔드가 자재코드를 해소하는 정본 키 — 반드시 함께 전달돼야 함.
    expect(item?.assetTypeId).toBe('at-1');
  });

  it('staged-create(placeholder assetType, code 없음)도 assetTypeId 를 전달한다', () => {
    const saved = { assets: [] as Asset[], cables: [] as WorkingCopyRow[] };
    const overlays = emptyOverlays();
    // staged-create: assetType 은 placeholder({ placementKind }), code 없음.
    const staged = asset('temp-2', {
      assetTypeId: 'at-rack',
      assetType: { placementKind: 'RACK' } as Asset['assetType'],
    });
    overlays.assets = stageCreate(overlays.assets, staged.id, staged);

    const { after } = overlayToChanges(saved, overlays, FLOOR);
    const item = after.equipment.find((e) => e.id === 'temp-2');
    expect(item?.assetTypeId).toBe('at-rack');
    expect(item?.materialCategoryCode).toBeNull();
  });

  it('deleted equipment → before only, not after', () => {
    const existing = asset('a-1');
    const saved = { assets: [existing], cables: [] as WorkingCopyRow[] };
    const overlays = emptyOverlays();
    overlays.assets = stageDelete(overlays.assets, 'a-1', false);

    const { before, after } = overlayToChanges(saved, overlays, FLOOR);
    expect(before.equipment.map((e) => e.id)).toContain('a-1');
    expect(after.equipment.map((e) => e.id)).not.toContain('a-1');
  });

  it('updated position → both before and after with different positionX', () => {
    const existing = asset('a-1', { positionX: 10 });
    const saved = { assets: [existing], cables: [] as WorkingCopyRow[] };
    const overlays = emptyOverlays();
    overlays.assets = stageUpdate(overlays.assets, 'a-1', { positionX: 999 });

    const { before, after } = overlayToChanges(saved, overlays, FLOOR);
    expect(before.equipment.find((e) => e.id === 'a-1')?.positionX).toBe(10);
    expect(after.equipment.find((e) => e.id === 'a-1')?.positionX).toBe(999);
  });

  it('unchanged equipment is pruned from both sides', () => {
    const existing = asset('a-1');
    const saved = { assets: [existing], cables: [] as WorkingCopyRow[] };
    const overlays = emptyOverlays(); // no staged changes

    const { before, after } = overlayToChanges(saved, overlays, FLOOR);
    expect(before.equipment).toHaveLength(0);
    expect(after.equipment).toHaveLength(0);
  });

  it('scopes to the active floor only', () => {
    const onFloor = asset('a-1', { floorId: FLOOR });
    const offFloor = asset('a-2', { floorId: 'floor-2' });
    const saved = { assets: [onFloor, offFloor], cables: [] as WorkingCopyRow[] };
    const overlays = emptyOverlays();
    overlays.assets = stageUpdate(overlays.assets, 'a-1', { positionX: 999 });
    overlays.assets = stageUpdate(overlays.assets, 'a-2', { positionX: 999 });

    const { after } = overlayToChanges(saved, overlays, FLOOR);
    expect(after.equipment.map((e) => e.id)).toEqual(['a-1']);
  });

  it('includes floor cables whose endpoint is on the floor', () => {
    const eq = asset('eq-1');
    const cable: WorkingCopyRow = {
      id: 'c-1',
      source: { equipmentId: 'eq-1', moduleId: null },
      target: { equipmentId: 'eq-other', moduleId: null },
      cableType: 'UTP',
      categoryCode: 'CBL-UTP',
      totalLength: 12,
    };
    const saved = { assets: [eq], cables: [] as WorkingCopyRow[] };
    const overlays = emptyOverlays();
    overlays.cables = stageCreate(overlays.cables, cable.id, cable);

    const { before, after } = overlayToChanges(saved, overlays, FLOOR);
    expect(before.cables.map((c) => c.id)).not.toContain('c-1');
    const added = after.cables.find((c) => c.id === 'c-1');
    expect(added?.materialCategoryCode).toBe('CBL-UTP');
    expect(added?.totalLength).toBe(12);
  });
});
