import { describe, it, expect, beforeEach } from 'vitest';
import { useSubstationWorkingCopy } from './substationStore';
import type { SlimAssetDTO } from '../trace/traceGraph';

const lite = (over: Partial<SlimAssetDTO> = {}): SlimAssetDTO => ({
  id: 'a1', name: 'OFD', substationId: 's1', substationName: '춘천',
  parentAssetId: null, connectionKind: null, code: 'OFD', slotIndex: null, ...over,
});

describe('hydrateGlobal / hydrateNodeAssets (전역 단일 SSOT hydration)', () => {
  beforeEach(() => useSubstationWorkingCopy.getState().reset());

  it('hydrateGlobal: lite 자산·케이블을 saved 에 적재', () => {
    useSubstationWorkingCopy.getState().hydrateGlobal(
      [lite({ id: 'a1' }), lite({ id: 'a2', substationId: 's2' })],
      [{ id: 'c1', cableType: 'FIBER', sourceAssetId: 'a1', targetAssetId: 'a2', sourceRole: 'IN', targetRole: 'IN' }],
    );
    const s = useSubstationWorkingCopy.getState().saved;
    expect(s.assets.map((a) => a.id).sort()).toEqual(['a1', 'a2']);
    expect(s.cables.map((c) => c.id)).toEqual(['c1']);
  });

  it('hydrateGlobal: 기존 detail 행을 lite 가 덮지 않음(detail 보존)', () => {
    // detail 행 시드(assetTypeId 비어있지 않음 = detail).
    useSubstationWorkingCopy.getState().hydrateNodeAssets([]); // no-op 안전성
    // 실제 /workingcopy detail 행은 updatedAt(DB 타임스탬프)을 가진다 = detail 마커.
    useSubstationWorkingCopy.setState((s) => ({
      saved: { ...s.saved, assets: [{ ...lite({ id: 'a1' }), assetTypeId: 'real-type', status: '운영중', updatedAt: '2020-01-01T00:00:00Z' } as never] },
    }));
    useSubstationWorkingCopy.getState().hydrateGlobal([lite({ id: 'a1' })], []);
    const a1 = useSubstationWorkingCopy.getState().saved.assets.find((a) => a.id === 'a1')!;
    expect(a1.assetTypeId).toBe('real-type'); // detail 보존
    expect(a1.status).toBe('운영중');
  });

  it('hydrateNodeAssets: 기존 자산에 status 필드만 patch(생성·code 미변경)', () => {
    useSubstationWorkingCopy.getState().hydrateGlobal([lite({ id: 'a1', code: 'OPT-COT' })], []);
    useSubstationWorkingCopy.getState().hydrateNodeAssets([
      { id: 'a1', name: 'OFD', assetTypeName: '', assetTypeColor: null, substationId: 's1', substationName: '춘천',
        floorId: null, floorName: null, roomText: null, installDate: '2020-01-01', manager: '홍길동', status: '운영중',
        warrantyUntil: null, replaceDue: null, lastMaintenanceDate: null },
    ]);
    const a1 = useSubstationWorkingCopy.getState().saved.assets.find((a) => a.id === 'a1')!;
    expect(a1.status).toBe('운영중');
    expect(a1.manager).toBe('홍길동');
    expect(a1.installDate).toBe('2020-01-01');
    expect(a1.assetType.code).toBe('OPT-COT'); // code 퇴화 없음
  });

  it('hydrateNodeAssets: saved 에 없는 id 는 무시(생성 안 함)', () => {
    useSubstationWorkingCopy.getState().hydrateNodeAssets([
      { id: 'ghost', name: 'x', assetTypeName: '', assetTypeColor: null, substationId: 's9', substationName: 'z',
        floorId: null, floorName: null, roomText: null, installDate: null, manager: null, status: '운영중',
        warrantyUntil: null, replaceDue: null, lastMaintenanceDate: null },
    ]);
    expect(useSubstationWorkingCopy.getState().saved.assets.find((a) => a.id === 'ghost')).toBeUndefined();
  });
});
