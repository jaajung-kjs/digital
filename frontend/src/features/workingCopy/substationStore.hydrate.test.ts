import { describe, it, expect, beforeEach } from 'vitest';
import { useSubstationWorkingCopy } from './substationStore';
import type { SlimAssetDTO } from '../trace/traceGraph';

const lite = (over: Partial<SlimAssetDTO> = {}): SlimAssetDTO => ({
  id: 'a1', name: 'OFD', substationId: 's1', substationName: '춘천',
  parentAssetId: null, connectionKind: null, code: 'OFD', slotIndex: null, ...over,
});

describe('hydrateGlobal (전역 단일 SSOT hydration)', () => {
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
    // 실제 /workingcopy detail 행은 updatedAt(DB 타임스탬프)을 가진다 = detail 마커.
    useSubstationWorkingCopy.setState((s) => ({
      saved: { ...s.saved, assets: [{ ...lite({ id: 'a1' }), assetTypeId: 'real-type', status: '운영중', updatedAt: '2020-01-01T00:00:00Z' } as never] },
    }));
    useSubstationWorkingCopy.getState().hydrateGlobal([lite({ id: 'a1' })], []);
    const a1 = useSubstationWorkingCopy.getState().saved.assets.find((a) => a.id === 'a1')!;
    expect(a1.assetTypeId).toBe('real-type'); // detail 보존
    expect(a1.status).toBe('운영중');
  });

});
