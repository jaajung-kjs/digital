/**
 * pathHighlightStore — cold-cache 회귀 테스트 (리뷰 W2)
 *
 * resolveSeedFromCable 가 카테고리를 getQueryData(콜드캐시 → undefined)로 읽으면
 * groupId 미해소 → 토폴로지 모달이 false error 를 띄웠다.
 * ensureQueryData 로 바꾸면 카테고리가 비어 있어도 온디맨드 페치 후 group 을 해소한다.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// utils/api 모킹 — fetchCableCategories 가 GET /cable-categories 로 카테고리를 가져온다.
vi.mock('../../../utils/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));

// 서버 trace / projection 모킹 — group 해소 경로만 검증, 그래프/투영 로직은 별도 테스트.
vi.mock('../../trace/useServerTrace', () => ({
  buildTraceOverlay: vi.fn(() => ({})),
  fetchServerTraceGraph: vi.fn(async () => ({ cables: [] })),
}));
vi.mock('../../trace/traceProjection', () => ({
  projectTrace: vi.fn(() => ({ rows: [], seedCableId: 'cable-1' })),
}));

// 워킹카피 스토어 모킹 — effectiveCables 만 사용.
// vi.hoisted: mock 팩토리가 hoist 되므로 참조하는 변수도 함께 hoist 해야 TDZ 회피.
const { effectiveCables } = vi.hoisted(() => ({ effectiveCables: vi.fn() }));
vi.mock('../../workingCopy/substationStore', () => ({
  useSubstationWorkingCopy: {
    getState: () => ({
      effectiveCables,
      overlays: { cables: {}, assets: {} },
    }),
  },
}));

import { api } from '../../../utils/api';
import { queryClient } from '../../../lib/queryClient';
import { CABLE_CATEGORY_KEYS } from '../../cables/hooks/useCableCategories';
import { buildTraceOverlay, fetchServerTraceGraph } from '../../trace/useServerTrace';
import { projectTrace } from '../../trace/traceProjection';
import { usePathHighlightStore } from './pathHighlightStore';

const CATEGORY = { id: 'cat-fiber', groupId: 'grp-fiber', name: '광케이블' };

// 설정 mockReset:true 가 매 테스트 전 구현을 초기화하므로 beforeEach 에서 다시 심는다.
beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear(); // 콜드캐시 — 카테고리 미페치 상태
  usePathHighlightStore.getState().clearHighlight();
  // categoryId 만 있고 groupId 직접 없음 → 카테고리 카탈로그로 group 을 해소해야 함.
  effectiveCables.mockReturnValue([
    { id: 'cable-1', sourceAssetId: 'asset-seed', groupId: null, categoryId: 'cat-fiber' },
  ]);
  (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: [CATEGORY] } });
  (buildTraceOverlay as ReturnType<typeof vi.fn>).mockReturnValue({});
  (fetchServerTraceGraph as ReturnType<typeof vi.fn>).mockResolvedValue({ cables: [] });
  (projectTrace as ReturnType<typeof vi.fn>).mockReturnValue({ rows: [], seedCableId: 'cable-1' });
});

describe('prepareTopology — cold-cache 카테고리', () => {
  it('카테고리 캐시가 비어 있어도 ensureQueryData 로 페치 후 group 을 해소하고 모달을 연다', async () => {
    // precondition: 캐시에 카테고리 없음
    expect(queryClient.getQueryData(CABLE_CATEGORY_KEYS.all)).toBeUndefined();

    await usePathHighlightStore.getState().prepareTopology('cable-1');

    const s = usePathHighlightStore.getState();
    expect(s.error).toBeNull();
    expect(s.modalOpen).toBe(true);
    expect(s.projection).not.toBeNull();

    // 온디맨드 페치가 일어났고, 해소된 groupId 로 서버 trace 를 호출했다.
    expect(api.get).toHaveBeenCalledWith('/cable-categories');
    expect(fetchServerTraceGraph).toHaveBeenCalledWith('asset-seed', 'grp-fiber', expect.anything());
    // 캐시에 카테고리가 채워짐(이후 호출은 캐시 공유)
    expect(queryClient.getQueryData(CABLE_CATEGORY_KEYS.all)).toEqual([CATEGORY]);
  });

  it('카테고리가 이미 캐시에 있으면 재페치 없이 group 을 해소한다', async () => {
    queryClient.setQueryData(CABLE_CATEGORY_KEYS.all, [CATEGORY]);

    await usePathHighlightStore.getState().prepareTopology('cable-1');

    expect(api.get).not.toHaveBeenCalled();
    expect(usePathHighlightStore.getState().modalOpen).toBe(true);
    expect(fetchServerTraceGraph).toHaveBeenCalledWith('asset-seed', 'grp-fiber', expect.anything());
  });
});
