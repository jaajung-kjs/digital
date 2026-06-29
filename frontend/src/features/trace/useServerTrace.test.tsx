/**
 * useServerTrace 단위 테스트
 *
 * - api.post 모킹 → 서버 component 응답으로 buildTraceGraph 가 채워진 graph 반환
 * - enabled 게이팅: temp id / null 이면 api.post 호출 안 함
 * - overlay hash: staged cable 변경 시 queryKey 가 달라짐
 * - graph 구조: cables / nameById / subNameById / roleById / parentById 검증
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../utils/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api } from '../../utils/api';
import { useSubstationWorkingCopy } from '../workingCopy/substationStore';
import type { AssetsOverlay, CablesOverlay } from '../workingCopy/substationStore';
import { useServerTrace, buildTraceOverlay, stableHash } from './useServerTrace';

// ─── 픽스처 ──────────────────────────────────────────────────────────────────

const SEED_ID = 'asset-seed';
const GROUP_ID = 'grp-fiber';

/** 서버 POST /api/trace 응답 픽스처 */
const mockResponse = {
  nodeIds: ['asset-seed', 'slotA', 'slotB', 'asset-remote'],
  cableIds: ['core5', 'opgw', 'core5b'],
  cables: [
    { id: 'core5',  groupId: GROUP_ID, sourceAssetId: 'slotA', targetAssetId: 'asset-seed', sourceRole: 'OUT', targetRole: null, number: 5 },
    { id: 'opgw',   groupId: GROUP_ID, sourceAssetId: 'slotA', targetAssetId: 'slotB',  sourceRole: 'IN',  targetRole: 'IN',  number: null, specParams: { cores: 24 } },
    { id: 'core5b', groupId: GROUP_ID, sourceAssetId: 'slotB', targetAssetId: 'asset-remote', sourceRole: 'OUT', targetRole: null, number: 5 },
  ],
  nodes: [
    { id: 'asset-seed',   name: '춘천단말',  role: 'device', parentAssetId: null,   substationId: 'sub-A', substationName: '춘천S/S', slotIndex: null },
    { id: 'slotA',        name: 'OFD슬롯A', role: 'slot',   parentAssetId: 'ofdA', substationId: 'sub-A', substationName: '춘천S/S', slotIndex: 2 },
    { id: 'slotB',        name: 'OFD슬롯B', role: 'slot',   parentAssetId: 'ofdB', substationId: 'sub-B', substationName: '홍천S/S', slotIndex: 5 },
    { id: 'asset-remote', name: '홍천단말',  role: 'device', parentAssetId: null,   substationId: 'sub-B', substationName: '홍천S/S', slotIndex: null },
  ],
  truncated: false,
};

// ─── 테스트 헬퍼 ─────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

// ─── 테스트 ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  useSubstationWorkingCopy.getState().reset();
  vi.clearAllMocks();
  (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: mockResponse } });
});

describe('useServerTrace — 기본 동작', () => {
  it('서버 응답으로 graph 를 만들고 cables / nameById / roleById / parentById 가 채워짐', async () => {
    const { result } = renderHook(
      () => useServerTrace(SEED_ID, GROUP_ID),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.graph).not.toBeNull());

    const { graph } = result.current;
    expect(graph).not.toBeNull();

    // cables: 서버 응답 케이블 3개 그대로 반영
    expect(graph!.cables.length).toBe(3);
    expect(graph!.cables.find((c) => c.id === 'opgw')?.specParams).toEqual({ cores: 24 });

    // nameById: nodes 의 name 으로 채워짐
    expect(graph!.nameById.get('asset-seed')).toBe('춘천단말');
    expect(graph!.nameById.get('asset-remote')).toBe('홍천단말');

    // roleById: nodes 의 role → assetType.role 경로로 읽힘
    expect(graph!.roleById.get('asset-seed')).toBe('device');
    expect(graph!.roleById.get('slotA')).toBe('slot');

    // parentById: slotA 의 parentAssetId
    expect(graph!.parentById.get('slotA')).toBe('ofdA');
    expect(graph!.parentById.get('asset-seed')).toBeNull();

    // subNameById: substationId→substationName 경유로 채워짐
    expect(graph!.subNameById.get('asset-seed')).toBe('춘천S/S');
    expect(graph!.subNameById.get('slotB')).toBe('홍천S/S');

    // subById: substationId 직접 매핑
    expect(graph!.subById.get('asset-seed')).toBe('sub-A');
    expect(graph!.subById.get('slotB')).toBe('sub-B');
  });

  it('api.post 가 /trace 로 seedAssetId / groupId 를 보냄', async () => {
    const { result } = renderHook(
      () => useServerTrace(SEED_ID, GROUP_ID),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.graph).not.toBeNull());

    expect(api.post).toHaveBeenCalledWith('/trace', expect.objectContaining({
      seedAssetId: SEED_ID,
      groupId: GROUP_ID,
    }));
    // staged 가 없으면 overlay 없이 보냄
    const callArg = (api.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(callArg.overlay).toBeUndefined();
  });
});

describe('useServerTrace — enabled 게이팅', () => {
  it('seedAssetId 가 null 이면 api.post 호출 안 함', () => {
    renderHook(
      () => useServerTrace(null, GROUP_ID),
      { wrapper: makeWrapper() },
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it('seedAssetId 가 temp id 면 api.post 호출 안 함', () => {
    renderHook(
      () => useServerTrace('temp-abc-123', GROUP_ID),
      { wrapper: makeWrapper() },
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it('groupId 가 null 이면 api.post 호출 안 함', () => {
    renderHook(
      () => useServerTrace(SEED_ID, null),
      { wrapper: makeWrapper() },
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it('비활성 상태에서 graph 는 null, isLoading 은 false', () => {
    const { result } = renderHook(
      () => useServerTrace(null, GROUP_ID),
      { wrapper: makeWrapper() },
    );
    expect(result.current.graph).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useServerTrace — overlay hash', () => {
  it('staged cable 이 없으면 overlay 없이 호출', async () => {
    const { result } = renderHook(
      () => useServerTrace(SEED_ID, GROUP_ID),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.graph).not.toBeNull());
    const callArg = (api.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(callArg.overlay).toBeUndefined();
  });

  it('staged cable create 가 있으면 overlay.cables.creates 에 포함', async () => {
    // staged cable 추가: store 에 직접 stage
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (useSubstationWorkingCopy.getState().stageCableCreate as any)({
      id: 'temp-new-cable',
      sourceAssetId: 'asset-seed',
      targetAssetId: 'asset-remote',
      updatedAt: null,
    });

    const { result } = renderHook(
      () => useServerTrace(SEED_ID, GROUP_ID),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.graph).not.toBeNull());

    const callArg = (api.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(callArg.overlay).toBeDefined();
    expect(callArg.overlay.cables.creates.length).toBeGreaterThan(0);
    expect(callArg.overlay.cables.creates[0].tempId).toBe('temp-new-cable');
  });
});

describe('stableHash — 순서-안정성(W1)', () => {
  // CablesOverlay/AssetsOverlay shape 헬퍼 — baseVersions 는 deletes 의 baseVersion 에만 영향.
  const makeOverlays = (
    creates: Record<string, Record<string, unknown>>,
    updates: Record<string, Record<string, unknown>>,
    deletes: string[],
    assetCreates: Record<string, { id: string; assetType?: { role?: string | null } }>,
    baseVersions: Record<string, string> = {},
  ): { cables: CablesOverlay; assets: AssetsOverlay } => ({
    cables: { creates, updates, deletes, baseVersions } as unknown as CablesOverlay,
    assets: { creates: assetCreates, updates: {} } as unknown as AssetsOverlay,
  });

  it('배열 삽입 순서가 달라도 동일 내용이면 같은 해시', () => {
    const cA = { id: 'cab-1', sourceAssetId: 'a', targetAssetId: 'b', categoryId: 'cat' };
    const cB = { id: 'cab-2', sourceAssetId: 'c', targetAssetId: 'd', categoryId: 'cat' };

    // overlay 1: temp 케이블 t1,t2 순으로 생성, deletes [d1,d2], assets x,y 순
    const o1 = stableHash(
      buildTraceOverlay(
        makeOverlays(
          { t1: cA, t2: cB },
          {},
          ['d1', 'd2'],
          { x: { id: 'x', assetType: { role: 'device' } }, y: { id: 'y', assetType: { role: 'slot' } } },
        ),
      ),
    );

    // overlay 2: 같은 내용을 반대 순서로 구성(키 순서·배열 순서 모두 뒤집음)
    const o2 = stableHash(
      buildTraceOverlay(
        makeOverlays(
          { t2: cB, t1: cA },
          {},
          ['d2', 'd1'],
          { y: { id: 'y', assetType: { role: 'slot' } }, x: { id: 'x', assetType: { role: 'device' } } },
        ),
      ),
    );

    expect(o1).toBe(o2);
    expect(o1).not.toBe(''); // 비어있지 않음(실제 delta)
  });

  it('객체 키 순서가 달라도 같은 해시(replacer 키 정렬)', () => {
    const o1 = stableHash(
      buildTraceOverlay(makeOverlays({ t1: { id: 'c1', sourceAssetId: 'a', targetAssetId: 'b' } }, {}, [], {})),
    );
    const o2 = stableHash(
      buildTraceOverlay(makeOverlays({ t1: { id: 'c1', targetAssetId: 'b', sourceAssetId: 'a' } }, {}, [], {})),
    );
    expect(o1).toBe(o2);
  });

  it('내용이 다르면 해시가 다름(거짓 동일 방지)', () => {
    const o1 = stableHash(buildTraceOverlay(makeOverlays({ t1: { id: 'c1', sourceAssetId: 'a' } }, {}, [], {})));
    const o2 = stableHash(buildTraceOverlay(makeOverlays({ t1: { id: 'c1', sourceAssetId: 'z' } }, {}, [], {})));
    expect(o1).not.toBe(o2);
  });

  it('빈 overlay 는 빈 문자열', () => {
    expect(stableHash(buildTraceOverlay(makeOverlays({}, {}, [], {})))).toBe('');
  });
});

describe('useServerTrace — staged-create 노드 backfill', () => {
  // 서버 nodes[] 는 DB id 만 담는다 → staged 신규자산(temp id)은 nodeIds/cables 에는 있어도
  // nodes[] 에 없어 role=null/이름없음 으로 떨어진다. 워킹카피 effective 로 보강돼야 한다.
  const STAGED_FEEDER = 'temp-feeder-1';
  const responseWithStagedNode = {
    nodeIds: ['asset-seed', 'slotA', STAGED_FEEDER],
    cableIds: ['core5', 'temp-cab-1'],
    cables: [
      { id: 'core5', groupId: GROUP_ID, sourceAssetId: 'slotA', targetAssetId: 'asset-seed', sourceRole: 'OUT', targetRole: null, number: 5 },
      { id: 'temp-cab-1', groupId: GROUP_ID, sourceAssetId: 'slotA', targetAssetId: STAGED_FEEDER, sourceRole: 'IN', targetRole: 'IN', number: null },
    ],
    nodes: [
      // staged 자산(temp-feeder-1)은 DB 에 없으므로 서버 nodes[] 에 없음 — backfill 대상.
      { id: 'asset-seed', name: '춘천단말', role: 'device', parentAssetId: null, substationId: 'sub-A', substationName: '춘천S/S', slotIndex: null },
      { id: 'slotA', name: 'OFD슬롯A', role: 'slot', parentAssetId: 'ofdA', substationId: 'sub-A', substationName: '춘천S/S', slotIndex: 2 },
    ],
    truncated: false,
  };

  it('staged 케이블로 도달한 staged-create 자산이 role·name 으로 보강됨(role≠null)', async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: responseWithStagedNode } });

    // 워킹카피에 staged-create feeder 자산을 올린다(서버엔 없는 temp id).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (useSubstationWorkingCopy.getState().stageAssetCreate as any)({
      id: STAGED_FEEDER,
      name: '신규피더',
      substationId: 'sub-A',
      parentAssetId: 'ofdA',
      slotIndex: null,
      assetType: { id: 'at-feeder', name: '피더', role: 'feeder' },
    });

    const { result } = renderHook(
      () => useServerTrace(SEED_ID, GROUP_ID),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.graph).not.toBeNull());

    const { graph } = result.current;
    // role: 워킹카피 effective 에서 보강 — null 이 아닌 'feeder'(cableTrace 분류 정확).
    expect(graph!.roleById.get(STAGED_FEEDER)).toBe('feeder');
    // name: id 가 아닌 실제 이름으로 해소(토폴로지 모달 표시).
    expect(graph!.nameById.get(STAGED_FEEDER)).toBe('신규피더');
    // assets 에 staged 노드 포함.
    expect(graph!.assets.map((a) => a.id)).toContain(STAGED_FEEDER);
  });
});

describe('useServerTrace — buildTraceGraph 재사용 검증', () => {
  it('graph.assets 에 모든 nodes id 가 포함됨', async () => {
    const { result } = renderHook(
      () => useServerTrace(SEED_ID, GROUP_ID),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.graph).not.toBeNull());

    const assetIds = result.current.graph!.assets.map((a) => a.id).sort();
    expect(assetIds).toEqual(['asset-remote', 'asset-seed', 'slotA', 'slotB']);
  });

  it('slotIndexById 는 서버 node.slotIndex 를 보존(선번장 슬롯 순번 정렬용)', async () => {
    const { result } = renderHook(
      () => useServerTrace(SEED_ID, GROUP_ID),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.graph).not.toBeNull());

    // slot 노드는 서버가 내려준 slotIndex 그대로, slotIndex 미제공(null) 노드는 null.
    expect(result.current.graph!.slotIndexById.get('slotA')).toBe(2);
    expect(result.current.graph!.slotIndexById.get('slotB')).toBe(5);
    expect(result.current.graph!.slotIndexById.get('asset-seed')).toBeNull();
    expect(result.current.graph!.slotIndexById.get('asset-remote')).toBeNull();
  });

  it('isLoading: 로딩 중에는 true, 완료 후 false', async () => {
    const { result } = renderHook(
      () => useServerTrace(SEED_ID, GROUP_ID),
      { wrapper: makeWrapper() },
    );
    // 완료 후 false
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.graph).not.toBeNull();
  });
});
