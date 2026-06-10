import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// 평면도 더블클릭(에디터 LIVE 패널)이 현황/대장과 동일한 AssetInspector 를 렌더하고,
// 편집이 통합 WC(stageAssetUpdate)로 staging 되는지 — SSOT 라우팅 검증.

const stageAssetUpdate = vi.fn();

const asset = {
  id: 'e1', substationId: 's1', assetTypeId: 't1',
  assetType: { name: '랙', placementKind: 'RACK', fieldTemplate: [] },
  name: '랙01', attributes: {}, installDate: null, manager: null, status: '운영중',
  description: '에디터 메모', warrantyUntil: null, replaceDue: null, floorId: 'f1', updatedAt: '',
} as never;

vi.mock('../../../../editor/stores/snapshotStore', () => ({
  useSnapshotStore: (sel: (s: unknown) => unknown) => sel({ active: false }),
}));
vi.mock('../../../../assets/hooks/useAsset', () => ({ useAsset: () => ({ data: asset, isLoading: false }) }));
vi.mock('../../../../workspace/SelectionContext', () => ({ useSelection: () => ({ setSelectedAssetId: vi.fn() }) }));
vi.mock('../../../../workingCopy/substationStore', () => ({
  useSubstationWorkingCopy: (sel: (s: unknown) => unknown) => sel({ stageAssetUpdate }),
}));

import { EditorInspectorPanel } from './EditorInspectorPanel';

const wrap = (ui: ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe('EditorInspectorPanel — 에디터 LIVE = 통합 인스펙터', () => {
  it('통합 AssetInspector 핵심 필드 렌더(종류/상태/설명) + 공간 섹션 additive', () => {
    wrap(<EditorInspectorPanel equipmentId="e1" spatial={<div>랙뷰</div>} spatialLabel="내부 설비" />);
    expect(screen.getByText('종류')).toBeTruthy();
    expect(screen.getByText('상태')).toBeTruthy();
    expect(screen.getByText('설명')).toBeTruthy();
    // 공간 섹션은 인스펙터 아래에 additive 로 유지.
    expect(screen.getByText('내부 설비')).toBeTruthy();
    expect(screen.getByText('랙뷰')).toBeTruthy();
  });

  it('편집(이름) → stageAssetUpdate(통합 WC)', () => {
    wrap(<EditorInspectorPanel equipmentId="e1" />);
    const nameInput = screen.getByDisplayValue('랙01') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: '랙02' } });
    fireEvent.blur(nameInput);
    expect(stageAssetUpdate).toHaveBeenCalledWith('e1', { name: '랙02' });
  });
});
