import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React, { useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// api — /floors/:id, /floors/:id/plan, /substations/:id/workingcopy 를 라우팅.
vi.mock('../../../utils/api', () => ({ api: { get: vi.fn() } }));
import { api } from '../../../utils/api';

import { useFloorPlanData } from './useFloorPlanData';
import { useEditorStore } from '../stores/editorStore';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';

const FLOOR_ID = 'f1';
const SUB_ID = 's1';

// 한 변(canvas) 안에 들어 있지 않은(0,0 이 아닌) 위치의 설비 — fit 이 0,0 이 아니어야 함.
const asset = {
  id: 'a1', name: 'A', substationId: SUB_ID, floorId: FLOOR_ID,
  assetType: { placementKind: 'OFD' },
  positionX: 4000, positionY: 4000, width: 100, height: 100,
  parentAssetId: null, slotIndex: null, updatedAt: '2026-01-01T00:00:00.000Z',
};

function wrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

let wcResolve: (() => void) | null = null;

beforeEach(() => {
  useEditorStore.getState().setViewport(100, 0, 0);
  useEditorStore.getState().setViewportInitialized(false);

  // 컨테이너 측정 가능하도록 RAF 를 즉시 실행.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0); return 0 as unknown as number;
  });

  (api.get as any).mockImplementation((url: string) => {
    if (url === `/floors/${FLOOR_ID}`) {
      return Promise.resolve({ data: { data: { id: FLOOR_ID, substationId: SUB_ID } } });
    }
    if (url === `/floors/${FLOOR_ID}/plan`) {
      return Promise.resolve({ data: { data: {
        id: FLOOR_ID, gridSize: 20, majorGridSize: 60,
        canvasWidth: 10000, canvasHeight: 10000,
        equipment: [], backgroundDrawing: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
      } } });
    }
    if (url === `/substations/${SUB_ID}/workingcopy`) {
      // working copy 로드를 지연시켜 "plan 먼저, wc 나중" 순서를 강제.
      return new Promise((resolve) => {
        wcResolve = () => resolve({ data: { data: {
          assets: [asset], cables: [], fiberPaths: [],
        } } });
      });
    }
    return Promise.resolve({ data: { data: {} } });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  wcResolve = null;
});

function useHarness() {
  const ref = useRef<HTMLDivElement | null>(null);
  if (!ref.current) {
    const el = document.createElement('div');
    Object.defineProperty(el, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true });
    ref.current = el;
  }
  return useFloorPlanData(FLOOR_ID, ref);
}

describe('useFloorPlanData — 초기 뷰포트 fit 게이트', () => {
  it('working copy 로드 전엔 fit 하지 않고, 로드 후 effective 설비에 맞춰 fit 한다(0,0 고정 해소)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useHarness(), { wrapper: wrapper(qc) });

    // plan 은 로드됐지만 working copy 는 아직 미해결 → viewportInitialized 가 서지 않아야 함.
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(`/substations/${SUB_ID}/workingcopy`);
    });
    expect(useEditorStore.getState().viewportInitialized).toBe(false);
    expect(useEditorStore.getState().panX).toBe(0);
    expect(useEditorStore.getState().panY).toBe(0);

    // working copy 로드 완료 → effect 가 다시 돌아 실제 설비에 fit.
    wcResolve?.();

    await waitFor(() => {
      expect(useEditorStore.getState().viewportInitialized).toBe(true);
    });
    // 설비가 (4000,4000) 근방이라 fit 은 더 이상 0,0 이 아니어야 한다.
    const { panX, panY } = useEditorStore.getState();
    expect(panX !== 0 || panY !== 0).toBe(true);
  });
});
