/**
 * pathHighlightStore — 토폴로지 prepareTopology 테스트
 *
 * loadProjection 이 resolveSeedFromCable 없이 fetchServerTraceGraph(cableId, overlay) 를
 * 직접 호출하도록 변경됨 — 카테고리 해소 중간 단계가 제거됨.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// utils/api 모킹
vi.mock('../../../utils/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));

// 서버 trace / projection 모킹
vi.mock('../../trace/useServerTrace', () => ({
  buildTraceOverlay: vi.fn(() => ({})),
  fetchServerTraceGraph: vi.fn(async () => ({ cables: [] })),
}));
vi.mock('../../trace/traceProjection', () => ({
  projectTrace: vi.fn(() => ({ rows: [], seedCableId: 'cable-1' })),
}));

// 워킹카피 스토어 모킹
vi.mock('../../workingCopy/substationStore', () => ({
  useSubstationWorkingCopy: {
    getState: () => ({
      overlays: { cables: {}, assets: {} },
    }),
  },
}));

import { buildTraceOverlay, fetchServerTraceGraph } from '../../trace/useServerTrace';
import { projectTrace } from '../../trace/traceProjection';
import { usePathHighlightStore } from './pathHighlightStore';

beforeEach(() => {
  vi.clearAllMocks();
  usePathHighlightStore.getState().clearHighlight();
  (buildTraceOverlay as ReturnType<typeof vi.fn>).mockReturnValue({});
  (fetchServerTraceGraph as ReturnType<typeof vi.fn>).mockResolvedValue({ cables: [] });
  (projectTrace as ReturnType<typeof vi.fn>).mockReturnValue({ rows: [], seedCableId: 'cable-1' });
});

describe('prepareTopology', () => {
  it('fetchServerTraceGraph 를 seedCableId=cableId 로 직접 호출하고 모달을 연다', async () => {
    await usePathHighlightStore.getState().prepareTopology('cable-1');

    const s = usePathHighlightStore.getState();
    expect(s.error).toBeNull();
    expect(s.modalOpen).toBe(true);
    expect(s.projection).not.toBeNull();

    // 새 API: cableId 를 직접 넘김(seedAssetId/groupId 해소 없음)
    expect(fetchServerTraceGraph).toHaveBeenCalledWith('cable-1', expect.anything());
  });

  it('fetchServerTraceGraph 가 실패하면 error 가 설정되고 modalOpen 은 false', async () => {
    (fetchServerTraceGraph as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('서버 오류'));

    await usePathHighlightStore.getState().prepareTopology('cable-1');

    const s = usePathHighlightStore.getState();
    expect(s.error).toBe('서버 오류');
    expect(s.modalOpen).toBe(false);
  });
});
