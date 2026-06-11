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
      overlays: {
        assets: {}, cables: {}, fiberPaths: {},
        inspections: { creates: {}, updates: {}, deletes: [] },
      },
      saved: { assets: [], cables: [] },
      load: vi.fn(async () => {}),
    }),
  },
  inspectionDescriptor: {
    name: 'inspections', idOf: (x: { id: string }) => x.id, versionOf: () => null,
    isTemp: () => false, applyPatch: (x: object, p: object) => ({ ...x, ...p }),
  },
}));

// editor store — 활성 층 + baseFloorVersion 보유.
// setBaseFloorVersion 은 모든 getState() 호출이 같은 spy 를 보도록 모듈 스코프에 둔다.
const setBaseFloorVersionSpy = vi.fn();
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
      pendingInspections: [],
      pendingLogDeletes: [],
      pendingInspectionDeletes: [],
      clearPendingData: vi.fn(),
      setBaseFloorVersion: setBaseFloorVersionSpy,
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
    setBaseFloorVersionSpy.mockClear();
  });

  it('커밋 응답의 새 floor.updatedAt 으로 baseFloorVersion 을 동기적으로 갱신한다(2회차 409 견고화)', async () => {
    // 응답이 새 floor 버전을 실어 주는 정상 경로.
    vi.mocked(commitSubstation).mockResolvedValue({
      idMaps: { assets: {} },
      updated: { floor: { id: 'floor1', updatedAt: 'v2' } },
    } as never);

    const qc = new QueryClient();
    const { result } = renderHook(() => useCommitWorkingCopy(), { wrapper: wrapper(qc) });
    const res = await result.current();

    expect(res).toEqual({ ok: true });
    expect(setBaseFloorVersionSpy).toHaveBeenCalledWith('v2');
  });

  it('응답에 updated.floor 가 없으면 baseFloorVersion 을 건드리지 않는다', async () => {
    // floor 섹션이 커밋되지 않은 경우(updated.floor 부재) — 직접-set 을 하지 않는다.
    vi.mocked(commitSubstation).mockResolvedValue({ idMaps: { assets: {} } } as never);

    const qc = new QueryClient();
    const { result } = renderHook(() => useCommitWorkingCopy(), { wrapper: wrapper(qc) });
    const res = await result.current();

    expect(res).toEqual({ ok: true });
    expect(setBaseFloorVersionSpy).not.toHaveBeenCalled();
  });

  it('커밋 성공 시 활성 층의 floorPlan 쿼리를 무효화한다(무해한 fallback)', async () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useCommitWorkingCopy(), { wrapper: wrapper(qc) });
    const res = await result.current();

    expect(res).toEqual({ ok: true });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['floorPlan', 'floor1'] });
  });
});
