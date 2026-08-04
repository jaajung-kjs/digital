import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V2Asset, V2Workingcopy } from '../../types';

function asset(id: string, name: string, extra: Partial<V2Asset> = {}): V2Asset {
  return {
    id, name, typeId: 't-1', substationId: 'sub-1', status: 'normal',
    floorId: null, x: null, y: null, width: null, height: null,
    parentAssetId: null, containerKey: null, slotIndex: null, slotSpan: null,
    fieldValues: {}, updatedAt: '2026-07-27T00:00:00.000Z', ports: [],
    ...extra,
  };
}

// vi.mock is hoisted; wc is defined inside the factory to avoid TDZ.
// mockReset:true in vitest.config clears vi.fn implementations before each test,
// so we use a plain async function (not vi.fn) to ensure stable return value.
vi.mock('../../api', () => {
  const wc: V2Workingcopy = {
    substation: { id: 'sub-1', name: '변전소A', branchId: 'br-1', sortOrder: 1 },
    floors: [{ id: 'f-1', name: '1층', sortOrder: 1, substationId: 'sub-1' }],
    assets: [
      { id: 'a-rack', name: '랙1', typeId: 't-1', substationId: 'sub-1', status: 'normal', floorId: null, x: null, y: null, width: null, height: null, parentAssetId: null, containerKey: null, slotIndex: null, slotSpan: null, fieldValues: {}, updatedAt: '2026-07-27T00:00:00.000Z', ports: [{ id: 'p-r1', assetId: 'a-rack', group: 'P', index: 1, name: '포트 1', direction: 'BI', medium: 'network' }] },
      { id: 'a-mod', name: '모듈1', typeId: 't-1', substationId: 'sub-1', status: 'normal', floorId: null, x: null, y: null, width: null, height: null, parentAssetId: 'a-rack', containerKey: 'main', slotIndex: 0, slotSpan: 1, fieldValues: {}, updatedAt: '2026-07-27T00:00:01.000Z', ports: [{ id: 'p-m1', assetId: 'a-mod', group: 'P', index: 1, name: '포트 1', direction: 'BI', medium: 'network' }] },
    ],
    maintenanceLogs: [{ id: 'm-1', assetId: 'a-mod', occurredAt: '2026-07-01T00:00:00.000Z', content: '고장', action: null, updatedAt: '2026-07-27T00:00:00.000Z' }],
    inspectionLogs: [],
    cables: [{ id: 'c-1', name: null, substationId: 'sub-1', aPortId: 'p-r1', bPortId: 'p-m1', categoryId: null, pathPoints: [], specParams: {}, updatedAt: '2026-07-27T00:00:02.000Z' }],
    photos: [],
  };
  let failNext = false;
  return {
    fetchWorkingcopy: async (_id: string) => {
      if (failNext) {
        failNext = false;
        throw new Error('network fail');
      }
      return wc;
    },
    __setFailNext: (v: boolean) => {
      failNext = v;
    },
  };
});

import * as apiMock from '../../api';
import { useV2WorkingCopy } from '../workingCopyStore';

describe('useV2WorkingCopy', () => {
  beforeEach(async () => {
    await useV2WorkingCopy.getState().load('sub-1');
  });

  it('load: saved 반영 + baseVersions(assets) + overlay 초기화 + dirty 0', () => {
    const s = useV2WorkingCopy.getState();
    expect(s.effectiveAssets()).toHaveLength(2);
    expect(s.baseVersions['a-mod']).toBe('2026-07-27T00:00:01.000Z');
    expect(s.dirtyCount()).toBe(0);
  });

  it('stageAssetUpdate: effective에 패치 반영, 중복 패치는 병합', () => {
    const s = useV2WorkingCopy.getState();
    s.stageAssetUpdate('a-rack', { name: '랙1-개명' });
    s.stageAssetUpdate('a-rack', { status: 'fault' });
    const rack = useV2WorkingCopy.getState().effectiveAssets().find((a) => a.id === 'a-rack')!;
    expect(rack.name).toBe('랙1-개명');
    expect(rack.status).toBe('fault');
    expect(useV2WorkingCopy.getState().dirtyCount()).toBe(1);
  });

  it('stageAssetCreate + 그 자산 stage 삭제 = 흔적 없음(temp 소거)', () => {
    const s = useV2WorkingCopy.getState();
    s.stageAssetCreate(asset('tmp-1', '신규'));
    expect(useV2WorkingCopy.getState().isTempId('tmp-1')).toBe(true);
    s.stageAssetDeleteCascade('tmp-1');
    expect(useV2WorkingCopy.getState().effectiveAssets().find((a) => a.id === 'tmp-1')).toBeUndefined();
    expect(useV2WorkingCopy.getState().dirtyCount()).toBe(0);
  });

  it('stageAssetDeleteCascade: 자식 자산과 레코드까지 삭제 스테이징', () => {
    useV2WorkingCopy.getState().stageAssetDeleteCascade('a-rack');
    const s = useV2WorkingCopy.getState();
    expect(s.effectiveAssets()).toHaveLength(0);
    expect(s.effectiveMaintenanceFor('a-mod')).toHaveLength(0);
    expect(s.overlays.assets.deletes.sort()).toEqual(['a-mod', 'a-rack']);
    expect(s.overlays.maintenance.deletes).toEqual(['m-1']);
  });

  it('레코드 stage create/update/delete + effective 필터', () => {
    const s = useV2WorkingCopy.getState();
    s.stageInspectionCreate({ id: 'i-tmp', assetId: 'a-mod', inspectedAt: '2026-07-27T00:00:00.000Z', content: '점검', result: null, updatedAt: '' });
    expect(useV2WorkingCopy.getState().effectiveInspectionsFor('a-mod')).toHaveLength(1);
    s.stageMaintenanceUpdate('m-1', { content: '수정됨' });
    expect(useV2WorkingCopy.getState().effectiveMaintenanceFor('a-mod')[0]!.content).toBe('수정됨');
    s.stageMaintenanceDelete('m-1');
    expect(useV2WorkingCopy.getState().effectiveMaintenanceFor('a-mod')).toHaveLength(0);
  });

  it('revert: overlay 비움 + dirty 0', () => {
    const s = useV2WorkingCopy.getState();
    s.stageAssetUpdate('a-rack', { name: 'x' });
    s.revert();
    expect(useV2WorkingCopy.getState().dirtyCount()).toBe(0);
    expect(useV2WorkingCopy.getState().effectiveAssets().find((a) => a.id === 'a-rack')!.name).toBe('랙1');
  });

  it('undo: temporal 로 overlay 되돌리기', () => {
    const s = useV2WorkingCopy.getState();
    s.stageAssetUpdate('a-rack', { name: 'x' });
    useV2WorkingCopy.temporal.getState().undo();
    expect(useV2WorkingCopy.getState().dirtyCount()).toBe(0);
  });

  it('load 실패(fetch reject) 후에도 stage→undo 동작 (temporal resume 보장)', async () => {
    (apiMock as unknown as { __setFailNext: (v: boolean) => void }).__setFailNext(true);
    await expect(useV2WorkingCopy.getState().load('sub-1')).rejects.toThrow('network fail');
    // 기존 상태(성공한 beforeEach load)는 유지되고, temporal은 resume 되어야 한다
    const s = useV2WorkingCopy.getState();
    expect(s.effectiveAssets()).toHaveLength(2);
    s.stageAssetUpdate('a-rack', { name: '실패후수정' });
    expect(useV2WorkingCopy.getState().dirtyCount()).toBe(1);
    useV2WorkingCopy.temporal.getState().undo();
    expect(useV2WorkingCopy.getState().dirtyCount()).toBe(0);
  });

  it('load: cables saved + baseVersions 포함', () => {
    const s = useV2WorkingCopy.getState();
    expect(s.effectiveCables()).toHaveLength(1);
    expect(s.baseVersions['c-1']).toBe('2026-07-27T00:00:02.000Z');
  });

  it('stageCableCreate/Delete + dirty 반영', () => {
    const s = useV2WorkingCopy.getState();
    s.stageCableCreate({ id: 'c-tmp', name: null, substationId: 'sub-1', aPortId: 'p-x', bPortId: 'p-y', categoryId: null, pathPoints: [], specParams: {}, updatedAt: '' });
    expect(useV2WorkingCopy.getState().effectiveCables()).toHaveLength(2);
    expect(useV2WorkingCopy.getState().dirtyCount()).toBe(1);
    s.stageCableDelete('c-tmp');
    expect(useV2WorkingCopy.getState().dirtyCount()).toBe(0);
  });

  it('applyFloor: 해당 층 행만 교체하고 진행 중인 스테이징·undo 히스토리는 보존한다', () => {
    const s = useV2WorkingCopy.getState();
    s.stageAssetUpdate('a-rack', { name: '작업중' }); // 저장 안 된 편집
    s.applyFloor({
      id: 'f-1', name: '1층', sortOrder: 1, substationId: 'sub-1',
      backgroundDrawing: {
        source: { fileName: 'plan.dwg', importedAt: '2026-08-04T00:00:00.000Z', fileType: 'DWG' },
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
        layers: [], paths: [], texts: [], filled: [],
      },
    });

    const next = useV2WorkingCopy.getState();
    expect(next.saved.floors[0]!.backgroundDrawing?.source.fileName).toBe('plan.dwg');
    // 층 갱신이 워킹카피 전체를 리셋하지 않는다 (load() 재로드였다면 스테이징이 사라진다)
    expect(next.dirtyCount()).toBe(1);
    useV2WorkingCopy.temporal.getState().undo();
    expect(useV2WorkingCopy.getState().dirtyCount()).toBe(0);
  });

  it('cascade: 자산 삭제 시 그 포트의 케이블도 삭제 스테이지', () => {
    useV2WorkingCopy.getState().stageAssetDeleteCascade('a-rack'); // p-r1 보유 → c-1 물림
    const s = useV2WorkingCopy.getState();
    expect(s.effectiveCables()).toHaveLength(0);
    expect(s.overlays.cables.deletes).toEqual(['c-1']);
  });
});
