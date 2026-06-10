import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// SSOT — 모든 진입점(평면도 더블클릭·현황·대장)이 공유하는 단일 상세 본문.
// kind='rack' 이면 인스펙터 + 랙 공간 섹션(PresetActionsBar/RackView)을 함께 렌더하는지,
// 편집이 통합 WC(stageAssetUpdate)로 staging 되는지 검증.

const stageAssetUpdate = vi.fn();

const asset = {
  id: 'e1', substationId: 's1', assetTypeId: 't1',
  assetType: { name: '랙', placementKind: 'RACK', fieldTemplate: [] },
  name: '랙01', attributes: {}, installDate: null, manager: null, status: '운영중',
  description: '메모', warrantyUntil: null, replaceDue: null, floorId: 'f1', updatedAt: '',
} as never;

vi.mock('../../../../editor/stores/snapshotStore', () => ({
  useSnapshotStore: (sel: (s: unknown) => unknown) => sel({ active: false }),
}));
vi.mock('../../../../assets/hooks/useAsset', () => ({ useAsset: () => ({ data: undefined, isLoading: false }) }));
vi.mock('../../../../workspace/SelectionContext', () => ({ useSelection: () => ({ setSelectedAssetId: vi.fn() }) }));
vi.mock('../../../../workingCopy/substationStore', () => ({
  useSubstationWorkingCopy: (sel: (s: unknown) => unknown) => sel({ stageAssetUpdate }),
}));

// 랙 공간 섹션의 무거운 자식들은 가벼운 마커로 대체 — 본문이 공간 섹션을 끼워 넣는지만 검증.
vi.mock('../../../../rack/components/PresetActionsBar', () => ({ PresetActionsBar: () => <div>프리셋바</div> }));
vi.mock('../../../../editor/components/RackView', () => ({ RackView: () => <div>랙뷰그리드</div> }));

import { AssetDetailBody } from './AssetDetailBody';

const wrap = (ui: ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe('AssetDetailBody — SSOT 단일 상세 본문', () => {
  it('RACK: 인스펙터(종류/상태/설명) + 랙 공간 섹션(프리셋바·랙뷰)을 함께 렌더', () => {
    wrap(<AssetDetailBody equipmentId="e1" kind="rack" asset={asset} />);
    // 인스펙터 필드
    expect(screen.getByText('종류')).toBeTruthy();
    expect(screen.getByText('상태')).toBeTruthy();
    expect(screen.getByText('설명')).toBeTruthy();
    // 공간 섹션 — 평면도와 동일한 랙 모듈 GUI
    expect(screen.getByText('내부 설비')).toBeTruthy();
    expect(screen.getByText('프리셋바')).toBeTruthy();
    expect(screen.getByText('랙뷰그리드')).toBeTruthy();
  });

  it('편집(이름) → stageAssetUpdate(통합 WC)', () => {
    stageAssetUpdate.mockClear();
    wrap(<AssetDetailBody equipmentId="e1" kind="rack" asset={asset} />);
    const nameInput = screen.getByDisplayValue('랙01') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: '랙02' } });
    fireEvent.blur(nameInput);
    expect(stageAssetUpdate).toHaveBeenCalledWith('e1', { name: '랙02' });
  });

  it('grounding: 공간 섹션 없음 — 인스펙터만', () => {
    wrap(<AssetDetailBody equipmentId="e1" kind="grounding" asset={asset} />);
    expect(screen.getByText('종류')).toBeTruthy();
    expect(screen.queryByText('내부 설비')).toBeNull();
  });
});
