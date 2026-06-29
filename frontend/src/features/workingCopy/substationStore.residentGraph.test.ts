import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
vi.mock('../../utils/api', () => ({ api: { get: vi.fn() } }));
import { api } from '../../utils/api';
import { useSubstationWorkingCopy } from './substationStore';
import { buildTraceGraph } from '../trace/traceGraph';

const asset = (id: string, name: string, substationId: string) => ({
  id, name, substationId, parentAssetId: null, slotIndex: null,
  assetType: { role: 'device' }, updatedAt: '2020-01-01T00:00:00Z',
});

beforeEach(() => {
  useSubstationWorkingCopy.getState().reset();
  (api.get as Mock).mockReset();
  (api.get as Mock).mockImplementation((url: string) => {
    if (url.includes('/s1/workingcopy')) return Promise.resolve({ data: { data: { assets: [asset('eqA', '자국단말', 's1')], cables: [{ id: 'opgw', sourceAssetId: 'eqA', targetAssetId: 'eqB', cableType: 'FIBER' }], connectedSubstationIds: ['s2'] } } });
    if (url.includes('/s2/workingcopy')) return Promise.resolve({ data: { data: { assets: [asset('eqB', '대국단말', 's2')], cables: [], connectedSubstationIds: [] } } });
    return Promise.resolve({ data: { data: { assets: [], cables: [], connectedSubstationIds: [] } } });
  });
});

describe('전역 피드 제거 후 resident 그래프 이름 해소 (P3-4)', () => {
  it('연결 대국 자산 이름이 resident 그래프에서 해소된다(피드 없이)', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    const saved = useSubstationWorkingCopy.getState().saved;
    const g = buildTraceGraph({ assets: saved.assets as never[], cables: saved.cables as never[], substationNames: new Map() });
    expect(g.nameById.get('eqA')).toBe('자국단말');
    expect(g.nameById.get('eqB')).toBe('대국단말'); // 대국(연결 page-in)도 resident → 이름 해소
  });
});
