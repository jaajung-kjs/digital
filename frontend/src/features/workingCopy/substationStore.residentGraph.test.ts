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
    if (url.includes('/s1/workingcopy')) return Promise.resolve({ data: { data: { assets: [asset('eqA', '자국단말', 's1')], cables: [{ id: 'opgw', sourceAssetId: 'eqA', targetAssetId: 'eqB', cableType: 'FIBER' }] } } });
    return Promise.resolve({ data: { data: { assets: [], cables: [] } } });
  });
});

describe('대국 page-in 제거 후 resident 그래프 (Task 6)', () => {
  it('자국 자산 이름은 resident 그래프에서 해소된다', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    const saved = useSubstationWorkingCopy.getState().saved;
    const g = buildTraceGraph({ assets: saved.assets as never[], cables: saved.cables as never[], substationNames: new Map() });
    expect(g.nameById.get('eqA')).toBe('자국단말');
  });

  it('대국 자산(eqB)은 page-in 제거 후 resident 그래프에 없다(비-resident)', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    const saved = useSubstationWorkingCopy.getState().saved;
    const g = buildTraceGraph({ assets: saved.assets as never[], cables: saved.cables as never[], substationNames: new Map() });
    // 대국 자산은 resident 아님 — 이름은 useAssetRefs/서버 대국 패치로 해소
    expect(g.nameById.has('eqB')).toBe(false);
  });

  it('load() 는 s1 만 요청하고 대국(s2) workingcopy 를 요청하지 않는다', async () => {
    await useSubstationWorkingCopy.getState().load('s1');
    const calls = (api.get as Mock).mock.calls.map((c: unknown[]) => String(c[0]));
    expect(calls.some((u) => u.includes('/s2/workingcopy'))).toBe(false);
    expect(calls.filter((u) => u.includes('/s1/workingcopy')).length).toBe(1);
  });
});
