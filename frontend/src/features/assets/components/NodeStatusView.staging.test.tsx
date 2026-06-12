import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// SSOT: 본부·사업소(워킹카피 없는 뷰) 편집도 직접 저장(assetApi.update)이 아니라
// 자산이 속한 변전소 working copy 에 stage 돼야 한다(온디맨드 로드 + 가드 + 저장바).

// 직접 저장 경로가 살아있으면 안 된다 — assetApi.update 가 호출되면 실패.
const updateMock = vi.fn().mockResolvedValue({});
vi.mock('../../../services/assetApi', () => ({
  assetApi: { update: (id: string, patch: unknown) => updateMock(id, patch), getById: vi.fn() },
}));
// working copy load 는 /substations/:id/workingcopy 를 api.get 으로 가져온다 → 픽스처 주입.
vi.mock('../../../utils/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
// 인스펙터 연결 섹션은 네트워크 — 테스트에선 무력화.
// 연결은 effective(워킹카피)에서 읽으므로 서버 훅 mock 불필요(빈 스토어 → 빈 목록).
// 인스펙터 폴백(로딩 중) 페치는 사용 안 함 — effective 에서 해석.
vi.mock('../hooks/useAsset', () => ({ useAsset: () => ({ data: undefined }) }));
// 상세 본문의 종류별 공간 섹션(랙뷰/OFD 경로 등)은 자체 네트워크/스토어 의존이 무거움 —
// 이 staging 테스트는 인스펙터 편집 경로만 검증하므로 공간 섹션은 무력화한다.
vi.mock('../../equipment/components/detail/panels/resolveSpatialSection', () => ({
  resolveSpatialSection: () => null,
  spatialNeedsWidePanel: () => false,
}));

// jsdom 스텁(clearPendingData 등에서 호출될 수 있음).
if (typeof URL.revokeObjectURL !== 'function') {
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
}

const TS = '2026-06-05T00:00:00.000Z';
// working copy 가 로드하는 풀 Asset — 인스펙터 fieldTemplate 로 '모델' 인풋을 렌더.
const wcAsset = {
  id: 'a1', substationId: 's1', assetTypeId: 't1',
  assetType: { id: 't1', code: 'RACK', name: '랙', group: null, displayColor: null, fieldTemplate: [{ key: 'model', label: '모델', type: 'text' }] },
  name: '랙01', parentAssetId: null, slotIndex: null, floorId: null, roomText: null,
  attributes: { model: 'X' }, installDate: '2024-01-01', warrantyUntil: null, replaceDue: null,
  manager: '홍길동', description: null, status: '정상', sortOrder: 0, updatedAt: TS,
};

// 본부 리스트(useNodeAssets) — 두 변전소(s1/s2)에 걸친 자산.
vi.mock('../../../hooks/useNodeAssets', () => ({
  useNodeAssets: () => ({ data: [
    { id: 'a1', name: '랙01', assetTypeName: '랙', assetTypeColor: '#111', substationId: 's1', substationName: '춘천S/S', floorId: null, floorName: null, roomText: null, installDate: '2024-01-01', manager: '홍길동', status: '정상', warrantyUntil: null, replaceDue: null, lastMaintenanceDate: null },
    { id: 'b1', name: 'OFD-9', assetTypeName: 'OFD', assetTypeColor: '#222', substationId: 's2', substationName: '원주S/S', floorId: null, floorName: null, roomText: null, installDate: null, manager: null, status: null, warrantyUntil: null, replaceDue: null, lastMaintenanceDate: null },
  ] }),
}));

import { api } from '../../../utils/api';
import { NodeStatusView } from './NodeStatusView';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';

const wrap = (ui: ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
};

beforeEach(() => {
  vi.restoreAllMocks();
  updateMock.mockClear();
  // 깨끗한 전역 store 로 리셋(saved·overlay·substationId 모두).
  act(() => useSubstationWorkingCopy.getState().reset());
  (api.get as any).mockResolvedValue({
    data: { data: { assets: [wcAsset], cables: [], fiberPaths: [] } },
  });
});

describe('NodeStatusView — 본부·사업소 편집은 staging 경유(SSOT)', () => {
  it('자산 선택 → 변전소 WC 온디맨드 로드 → 설명 변경이 stageAssetUpdate 로 stage(직접저장 없음)', async () => {
    const stageSpy = vi.spyOn(useSubstationWorkingCopy.getState(), 'stageAssetUpdate');
    wrap(<NodeStatusView nodeType="branch" nodeId="b1" />);

    // 행 클릭(s1 자산) → WC 로드 트리거.
    fireEvent.click(screen.getByText('랙01'));

    // 로드 완료 → 인스펙터 편집 모드. #6 연필-인라인: 평소 plain text → 연필 클릭 시 textarea.
    await screen.findByTitle('설명 수정');
    fireEvent.click(screen.getByTitle('설명 수정'));
    const desc = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(desc, { target: { value: '수정메모' } });
    fireEvent.blur(desc);

    await waitFor(() =>
      expect(stageSpy).toHaveBeenCalledWith('a1', { description: '수정메모' }),
    );
    // 직접 저장 경로는 절대 호출되지 않는다.
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('전역: 다른 변전소(s1) 미저장이 있어도 s2 자산 편집을 차단하지 않는다(가드 제거, staged 보존)', async () => {
    // s1 을 로드하고 미저장 staging 을 만든다.
    await act(async () => {
      await useSubstationWorkingCopy.getState().load('s1');
    });
    act(() => useSubstationWorkingCopy.getState().stageAssetUpdate('a1', { name: '랙01-수정' }));
    expect(useSubstationWorkingCopy.getState().dirtyCount()).toBeGreaterThan(0);

    wrap(<NodeStatusView nodeType="branch" nodeId="b1" />);
    // 다른 변전소(s2) 자산 선택 — 전역 워킹카피라 차단 없이 s2 를 누적 로드한다.
    fireEvent.click(screen.getByText('OFD-9'));

    // 가드 배너 없음 + s2 로 전환(온디맨드 로드) + s1 staged 변경은 전역 overlay 에 보존.
    await waitFor(() => expect(useSubstationWorkingCopy.getState().substationId).toBe('s2'));
    expect(screen.queryByText(/미저장 변경이 있습니다/)).toBeNull();
    expect(useSubstationWorkingCopy.getState().dirtyCount()).toBeGreaterThan(0);
  });
});
