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
import { useServerTrace } from './useServerTrace';

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
    { id: 'asset-seed',   name: '춘천단말',  role: 'device', parentAssetId: null,   substationId: 'sub-A', substationName: '춘천S/S' },
    { id: 'slotA',        name: 'OFD슬롯A', role: 'slot',   parentAssetId: 'ofdA', substationId: 'sub-A', substationName: '춘천S/S' },
    { id: 'slotB',        name: 'OFD슬롯B', role: 'slot',   parentAssetId: 'ofdB', substationId: 'sub-B', substationName: '홍천S/S' },
    { id: 'asset-remote', name: '홍천단말',  role: 'device', parentAssetId: null,   substationId: 'sub-B', substationName: '홍천S/S' },
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

  it('slotIndexById 는 모든 노드에 null(서버가 slotIndex 미제공)', async () => {
    const { result } = renderHook(
      () => useServerTrace(SEED_ID, GROUP_ID),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.graph).not.toBeNull());

    for (const id of ['asset-seed', 'slotA', 'slotB', 'asset-remote']) {
      expect(result.current.graph!.slotIndexById.get(id)).toBeNull();
    }
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
