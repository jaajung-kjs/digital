import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../utils/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
import { api } from '../../utils/api';
import { useSubstationWorkingCopy } from './substationStore';

const tree = {
  headquarters: [{ id: 'hq1', name: '본부1', sortOrder: 0, updatedAt: '2026-01-01T00:00:00.000Z' }],
  branches: [{ id: 'br1', name: '지사1', headquartersId: 'hq1', sortOrder: 0, updatedAt: '2026-01-01T00:00:00.000Z' }],
  substations: [{ id: 'sub1', name: '변전소1', branchId: 'br1', address: null, sortOrder: 0, updatedAt: '2026-01-01T00:00:00.000Z' }],
  floors: [{ id: 'fl1', name: '1층', substationId: 'sub1', floorNumber: '1', sortOrder: 0, updatedAt: '2026-01-01T00:00:00.000Z' }],
};

beforeEach(() => { useSubstationWorkingCopy.getState().reset(); (api.get as any).mockReset(); });

describe('WC org tree (조직 4컬렉션)', () => {
  it('loadOrgTree → effective = saved, org dirty 0', async () => {
    (api.get as any).mockResolvedValue({ data: { data: tree } });
    await useSubstationWorkingCopy.getState().loadOrgTree();
    const s = useSubstationWorkingCopy.getState();
    expect(s.effectiveHeadquarters().map((x) => x.id)).toEqual(['hq1']);
    expect(s.effectiveBranches().map((x) => x.id)).toEqual(['br1']);
    expect(s.effectiveSubstations().map((x) => x.id)).toEqual(['sub1']);
    expect(s.effectiveFloors().map((x) => x.id)).toEqual(['fl1']);
    expect(s.dirtyCount()).toBe(0);
  });

  it('headquarters overlay 에 create staging → effectiveHeadquarters 에 포함 + saved-only 도 유지', async () => {
    (api.get as any).mockResolvedValue({ data: { data: tree } });
    await useSubstationWorkingCopy.getState().loadOrgTree();
    useSubstationWorkingCopy.getState().put('headquarters', { id: 'hqNew', name: '신규본부', sortOrder: 1, updatedAt: '' });
    const s = useSubstationWorkingCopy.getState();
    expect(s.effectiveHeadquarters().map((x) => x.id).sort()).toEqual(['hq1', 'hqNew']); // saved + staged create
    expect(s.dirtyCount()).toBe(1);
  });

  it('per-substation load() 는 조직 saved 를 비우지 않는다(전역 1회 로드 보존)', async () => {
    (api.get as any).mockResolvedValueOnce({ data: { data: tree } });
    await useSubstationWorkingCopy.getState().loadOrgTree();
    // per-substation 워킹카피 응답엔 조직 키가 없다.
    (api.get as any).mockResolvedValueOnce({ data: { data: { assets: [], cables: [] } } });
    await useSubstationWorkingCopy.getState().load('sub1');
    const s = useSubstationWorkingCopy.getState();
    expect(s.effectiveHeadquarters().map((x) => x.id)).toEqual(['hq1']); // 보존
    expect(s.effectiveFloors().map((x) => x.id)).toEqual(['fl1']);       // 보존
  });
});
