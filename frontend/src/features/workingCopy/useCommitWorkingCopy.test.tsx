import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// commitSubstation 은 네트워크 — 성공 응답을 stub.
vi.mock('./substationCommit', () => ({
  commitSubstation: vi.fn(),
}));

// substation working copy store — load 만 stub(재조정 no-op).
vi.mock('./substationStore', () => ({
  useSubstationWorkingCopy: {
    getState: () => ({
      substationId: 'sub1',
      overlays: { assets: {}, cables: {}, distributionCircuits: {}, fiberPaths: {} },
      saved: { assets: [], cables: [] },
      load: vi.fn(async () => {}),
    }),
  },
}));

// editor store — 활성 층 + baseFloorVersion 보유.
vi.mock('../editor/stores/editorStore', () => ({
  useEditorStore: {
    getState: () => ({
      activeFloorId: 'floor1',
      baseFloorVersion: 'v1',
      gridSize: 20,
      majorGridSize: 60,
      stagedBackgroundDrawing: undefined,
      stagedBackgroundOpacity: undefined,
      pendingUploads: [],
      pendingLogs: [],
      clearPendingData: vi.fn(),
    }),
  },
}));

// overlayToChanges — 변경 없음(아카이브 skip).
vi.mock('../report/overlayToChanges', () => ({
  overlayToChanges: () => ({
    before: { equipment: [], cables: [] },
    after: { equipment: [], cables: [] },
  }),
}));

import { useCommitWorkingCopy } from './useCommitWorkingCopy';
import { commitSubstation } from './substationCommit';

function wrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useCommitWorkingCopy', () => {
  beforeEach(() => {
    // vitest config 의 mockReset:true 가 매 테스트 구현을 비우므로 여기서 재설정.
    vi.mocked(commitSubstation).mockResolvedValue({ idMaps: { assets: {} } } as never);
  });

  it('커밋 성공 시 활성 층의 floorPlan 쿼리를 무효화한다(2회차 409 방지)', async () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useCommitWorkingCopy(), { wrapper: wrapper(qc) });
    const res = await result.current();

    expect(res).toEqual({ ok: true });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['floorPlan', 'floor1'] });
  });
});
