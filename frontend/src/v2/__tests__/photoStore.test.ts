import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V2Asset, V2AssetPhoto, V2Workingcopy } from '../types';

function asset(id: string, name: string, extra: Partial<V2Asset> = {}): V2Asset {
  return {
    id, name, typeId: 't-1', substationId: 'sub-1', status: 'normal',
    floorId: null, x: null, y: null, width: null, height: null,
    parentAssetId: null, containerKey: null, col: null, row: null, colSpan: null, rowSpan: null,
    fieldValues: {}, updatedAt: '2026-07-27T00:00:00.000Z', ports: [],
    ...extra,
  };
}

function photo(id: string, assetId: string, extra: Partial<V2AssetPhoto> = {}): V2AssetPhoto {
  return { id, assetId, filePath: `assets/${id}.png`, caption: null, updatedAt: '2026-07-27T00:00:00.000Z', ...extra };
}

// vi.mock is hoisted; wc is defined inside the factory to avoid TDZ (workingCopyStore.test.ts 관례).
vi.mock('../api', () => {
  const wc: V2Workingcopy = {
    substation: { id: 'sub-1', name: '변전소A', branchId: 'br-1', sortOrder: 1 },
    floors: [],
    assets: [asset('a-1', '자산1')],
    maintenanceLogs: [],
    inspectionLogs: [],
    cables: [],
    photos: [photo('ph-1', 'a-1')],
  };
  return {
    fetchWorkingcopy: async (_id: string) => wc,
  };
});

import { useV2WorkingCopy } from '../store/workingCopyStore';

describe('photos 오버레이', () => {
  beforeEach(async () => {
    await useV2WorkingCopy.getState().load('sub-1');
  });

  it('stagePhotoCreate → overlays.photos.creates 에 적재, dirtyCount 증가', () => {
    const s = useV2WorkingCopy.getState();
    s.stagePhotoCreate(photo('ph-new', 'a-1'));
    const after = useV2WorkingCopy.getState();
    expect(after.overlays.photos.creates['ph-new']).toBeDefined();
    expect(after.dirtyCount()).toBe(1);
  });

  it('stagePhotoUpdate(caption) → updates 에 patch 적재', () => {
    const s = useV2WorkingCopy.getState();
    s.stagePhotoUpdate('ph-1', { caption: '설명' });
    const after = useV2WorkingCopy.getState();
    expect(after.overlays.photos.updates['ph-1']).toEqual({ caption: '설명' });
  });

  it('stagePhotoDelete(saved id) → deletes 에 적재', () => {
    const s = useV2WorkingCopy.getState();
    s.stagePhotoDelete('ph-1');
    const after = useV2WorkingCopy.getState();
    expect(after.overlays.photos.deletes).toEqual(['ph-1']);
  });

  it('자산 삭제 시 그 자산의 사진 스테이징이 cascade 정리', () => {
    const s = useV2WorkingCopy.getState();
    s.stagePhotoCreate(photo('ph-new', 'a-1'));
    s.stageAssetDeleteCascade('a-1');
    const after = useV2WorkingCopy.getState();
    expect(after.overlays.photos.creates['ph-new']).toBeUndefined();
    expect(after.overlays.photos.deletes).toEqual(['ph-1']);
  });
});
