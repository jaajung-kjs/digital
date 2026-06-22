import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// commitSubstation 은 네트워크 — 성공 응답을 stub.
vi.mock('./substationCommit', () => ({
  commitSubstation: vi.fn(),
}));

// substation working copy store — load 만 stub(재조정 no-op).
// substationId / dirty 는 테스트가 바꿀 수 있도록 모듈 스코프 가변값으로 둔다(C2 경로 검증).
const storeStubs = {
  substationId: 'sub1' as string | null,
  load: vi.fn(async () => {}),
  loadOrgTree: vi.fn(async () => {}),
  revert: vi.fn(),
};
const sumOverlaysDirtyMock = vi.fn(() => 1);
vi.mock('./substationStore', () => ({
  useSubstationWorkingCopy: {
    getState: () => ({
      substationId: storeStubs.substationId,
      overlays: {
        assets: {}, cables: {},
        // 자산 하위레코드는 단일 records 컬렉션(점검/로그/사진).
        records: { creates: {}, updates: {}, deletes: [] },
      },
      saved: { assets: [], cables: [], records: [] },
      load: storeStubs.load,
      loadOrgTree: storeStubs.loadOrgTree,
      revert: storeStubs.revert,
    }),
  },
  // flushPendingRecords 가 mergeEffective([], overlay, recordsDescriptor) 로 staged 레코드를 읽는다.
  recordsDescriptor: {
    idOf: (x: { id: string }) => x.id, versionOf: () => null,
  },
  revokeStagedPhotoUrls: () => {},
  // dirty 게이트(C2) — 기본은 변경 있음(>0)으로 두어 커밋이 진행되게 한다.
  sumOverlaysDirty: () => sumOverlaysDirtyMock(),
}));

// editor store — 활성 층 + baseFloorVersion 보유.
// setBaseFloorVersion 은 모든 getState() 호출이 같은 spy 를 보도록 모듈 스코프에 둔다.
const setBaseFloorVersionSpy = vi.fn();
const stagedBgRef = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock('../editor/stores/editorStore', () => ({
  useEditorStore: {
    getState: () => ({
      activeFloorId: 'floor1',
      baseFloorVersion: 'v1',
      gridSize: 20,
      majorGridSize: 60,
      stagedBackgroundDrawing: stagedBgRef.value,
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
  selectFloorSettingsDirty: (s: { stagedBackgroundDrawing?: unknown; stagedBackgroundOpacity?: unknown }) =>
    s.stagedBackgroundDrawing !== undefined || s.stagedBackgroundOpacity !== undefined,
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
    storeStubs.substationId = 'sub1';
    storeStubs.load.mockClear();
    storeStubs.loadOrgTree.mockClear();
    storeStubs.revert.mockClear();
    sumOverlaysDirtyMock.mockReturnValue(1);
    stagedBgRef.value = undefined;
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

    expect(res.ok).toBe(true);
    expect(setBaseFloorVersionSpy).toHaveBeenCalledWith('v2');
  });

  it('응답에 updated.floor 가 없으면 baseFloorVersion 을 건드리지 않는다', async () => {
    // floor 섹션이 커밋되지 않은 경우(updated.floor 부재) — 직접-set 을 하지 않는다.
    vi.mocked(commitSubstation).mockResolvedValue({ idMaps: { assets: {} } } as never);

    const qc = new QueryClient();
    const { result } = renderHook(() => useCommitWorkingCopy(), { wrapper: wrapper(qc) });
    const res = await result.current();

    expect(res.ok).toBe(true);
    expect(setBaseFloorVersionSpy).not.toHaveBeenCalled();
  });

  it('커밋 성공 시 활성 층의 floorPlan 쿼리를 무효화한다(무해한 fallback)', async () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useCommitWorkingCopy(), { wrapper: wrapper(qc) });
    const res = await result.current();

    expect(res.ok).toBe(true);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['floorPlan', 'floor1'] });
  });

  it('C2 — 변전소 미오픈 + dirty 조직 변경: 전역 커밋(substationId="")·early-return 안 함·org 재로드, load 스킵', async () => {
    storeStubs.substationId = null; // 트리에서 "본부 추가" 등 — 변전소를 열지 않음
    sumOverlaysDirtyMock.mockReturnValue(1); // 조직 staged 변경 있음

    const qc = new QueryClient();
    const { result } = renderHook(() => useCommitWorkingCopy(), { wrapper: wrapper(qc) });
    const res = await result.current();

    expect(res.ok).toBe(true);
    // 종전 early-return 회귀 방지: 반드시 commit 이 호출돼야 한다(noop·손실 금지).
    expect(commitSubstation).toHaveBeenCalledTimes(1);
    // substationId 가 없으면 '' 로 전역 커밋(backend commitGlobal).
    expect(vi.mocked(commitSubstation).mock.calls[0][0]).toBe('');
    // 변전소-스코프 load 는 스킵, org 트리는 재로드.
    expect(storeStubs.load).not.toHaveBeenCalled();
    expect(storeStubs.revert).toHaveBeenCalled();
    expect(storeStubs.loadOrgTree).toHaveBeenCalled();
  });

  it('C2 — 변경 없음(dirty=0)이면 early-return, commit 안 함', async () => {
    sumOverlaysDirtyMock.mockReturnValue(0);

    const qc = new QueryClient();
    const { result } = renderHook(() => useCommitWorkingCopy(), { wrapper: wrapper(qc) });
    const res = await result.current();

    expect(res.ok).toBe(true);
    expect(commitSubstation).not.toHaveBeenCalled();
    expect(storeStubs.revert).not.toHaveBeenCalled();
  });

  it('도면(층) 설정만 dirty(overlays=0)여도 커밋한다 — 도면-only 저장 무반응 회귀 방지', async () => {
    sumOverlaysDirtyMock.mockReturnValue(0);   // overlays 변경 없음
    stagedBgRef.value = 'data:image/png;base64,xxx'; // 도면 배경만 staged

    const qc = new QueryClient();
    const { result } = renderHook(() => useCommitWorkingCopy(), { wrapper: wrapper(qc) });
    const res = await result.current();

    expect(res.ok).toBe(true);
    // early-return 하지 않고 commit 이 호출돼야(floor 섹션 전송).
    expect(commitSubstation).toHaveBeenCalledTimes(1);
    // floor 섹션이 마지막 인자로 전달됨(id=floor1).
    const floorArg = vi.mocked(commitSubstation).mock.calls[0].at(-1) as { id?: string } | undefined;
    expect(floorArg?.id).toBe('floor1');
  });
});
