import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../utils/api', () => ({ api: { get: vi.fn() } }));
import { api } from '../../utils/api';
import { useSubstationWorkingCopy } from './substationStore';

const asset = (id: string, substationId: string) => ({
  id, name: id, substationId, parentAssetId: null, slotIndex: null,
  assetType: { role: 'device' }, updatedAt: '2020-01-01T00:00:00Z',
});

beforeEach(() => {
  useSubstationWorkingCopy.getState().reset();
  (api.get as Mock).mockReset();
  (api.get as Mock).mockImplementation((url: string) => {
    if (url.includes('/s1/workingcopy')) {
      return Promise.resolve({ data: { data: { assets: [asset('eqA', 's1')], cables: [{ id: 'opgw', sourceAssetId: 'eqA', targetAssetId: 'eqB', cableType: 'FIBER' }], connectedSubstationIds: ['s2'] } } });
    }
    if (url.includes('/s2/workingcopy')) {
      return Promise.resolve({ data: { data: { assets: [asset('eqB', 's2')], cables: [], connectedSubstationIds: [] } } });
    }
    return Promise.resolve({ data: { data: { assets: [], cables: [], connectedSubstationIds: [] } } });
  });
});

describe('load — 연결 대국 page-in (§106)', () => {
  it('변전소 열기 시 connectedSubstationIds 의 대국까지 resident', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    const s = useSubstationWorkingCopy.getState();
    expect(s.substationId).toBe('s1'); // 열린 변전소는 s1 유지(syncSubData 가 안 바꿈)
    expect(s.saved.assets.map((a) => a.id).sort()).toEqual(['eqA', 'eqB']); // s2 대국 page-in
  });

  it('이미 resident 인 대국은 재요청하지 않는다(dedup)', async () => {
    await useSubstationWorkingCopy.getState().load('s1'); // s1 + s2
    (api.get as Mock).mockClear();
    await useSubstationWorkingCopy.getState().load('s1'); // 재로드
    const s2Calls = (api.get as Mock).mock.calls.filter((c) => String(c[0]).includes('/s2/workingcopy'));
    expect(s2Calls.length).toBe(0); // s2 이미 resident → connected page-in 건너뜀
  });
});
