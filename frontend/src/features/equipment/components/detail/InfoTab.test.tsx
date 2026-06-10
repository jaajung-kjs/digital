import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// 커스텀 속성 인라인 편집 → stageAssetUpdate({ attributes }) (강제 이동 없음).
const stageEquipmentUpdate = vi.fn();
const stageAssetUpdate = vi.fn();
vi.mock('../../../workingCopy/substationStore', () => ({
  useSubstationWorkingCopy: (sel: (s: unknown) => unknown) =>
    sel({ stageEquipmentUpdate, stageAssetUpdate }),
}));
vi.mock('../../../workingCopy/hooks', () => ({ useEffectiveAssets: () => [] }));

const asset = {
  id: 'e1', substationId: 's1', assetTypeId: 't1',
  assetType: { id: 't1', code: 'RACK', name: '랙', group: null, displayColor: null, fieldTemplate: [{ key: 'model', label: '모델', type: 'text' }] },
  name: '랙01', attributes: { model: 'X' }, installDate: null, manager: null, status: null,
};
vi.mock('../../../assets/hooks/useAsset', () => ({ useAsset: () => ({ data: asset }) }));

import { InfoTab } from './InfoTab';

const equipment = { id: 'e1', name: '랙01', manager: null, description: null, installDate: null } as never;
const wrap = (ui: ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe('InfoTab — 커스텀 속성 인라인 편집', () => {
  beforeEach(() => { stageEquipmentUpdate.mockClear(); stageAssetUpdate.mockClear(); });

  it('수정 → 속성 변경 → 적용: stageAssetUpdate 로 attributes 스테이징', () => {
    wrap(<InfoTab equipment={equipment} />);
    fireEvent.click(screen.getByText('수정'));

    const input = screen.getByLabelText('모델') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Y' } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByText('적용'));

    expect(stageEquipmentUpdate).toHaveBeenCalledWith('e1', expect.objectContaining({ name: '랙01' }));
    expect(stageAssetUpdate).toHaveBeenCalledWith('e1', { attributes: { model: 'Y' } });
  });
});
