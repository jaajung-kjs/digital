import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

// SSOT — 대장 그리드 편집이 registerStore 가 아니라 통합 working copy(stageAssetUpdate)로
// staging 되는지 검증한다.

const stageAssetUpdate = vi.fn();
const stageAssetCreate = vi.fn();
const stageAssetDelete = vi.fn();

const asset = {
  id: 'a1', substationId: 's1', assetTypeId: 't1',
  assetType: { id: 't1', code: 'RACK', name: '랙', group: null, displayColor: null, fieldTemplate: [], placementKind: 'RACK' },
  name: '장비1', attributes: {}, installDate: null, manager: null, status: null, description: null,
  parentAssetId: null, floorId: null, roomText: null, warrantyUntil: null, replaceDue: null,
  sortOrder: 0, updatedAt: '2026-06-05T00:00:00.000Z',
} as never;

const storeState = {
  stageAssetUpdate, stageAssetCreate, stageAssetDelete,
  substationId: 's1',
};
vi.mock('../../workingCopy/substationStore', () => ({
  useSubstationWorkingCopy: (sel: (s: unknown) => unknown) => sel(storeState),
}));
vi.mock('../../workingCopy/hooks', () => ({
  useEffectiveAssets: () => [asset],
  useWorkingCopyLoader: () => {},
}));
vi.mock('../hooks/useAssetTypes', () => ({
  useAssetTypes: () => ({ data: [{ id: 't1', code: 'RACK', name: '랙', group: null, displayColor: null, fieldTemplate: [], placementKind: 'RACK' }] }),
}));

import { SubstationAssetGrid } from './SubstationAssetGrid';

const wrap = (ui: ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('SubstationAssetGrid — 통합 working copy staging', () => {
  beforeEach(() => { stageAssetUpdate.mockClear(); stageAssetCreate.mockClear(); stageAssetDelete.mockClear(); });

  it('이름 셀 편집 → stageAssetUpdate(통합 WC) 호출', () => {
    wrap(<SubstationAssetGrid substationId="s1" />);
    const cell = screen.getByDisplayValue('장비1') as HTMLInputElement;
    fireEvent.change(cell, { target: { value: '새이름' } });
    fireEvent.blur(cell);
    expect(stageAssetUpdate).toHaveBeenCalledWith('a1', { name: '새이름' });
  });
});
