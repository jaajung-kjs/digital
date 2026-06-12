import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { setSelectedAssetId, startTrace, put, patch } = vi.hoisted(() => ({
  setSelectedAssetId: vi.fn(),
  startTrace: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
}));

vi.mock('../hooks/usePortStatus', () => ({
  usePortStatus: () => ({
    isLoading: false,
    mergedPaths: [{
      id: 'fp1',
      ofdA: { id: 'ofd1', name: '원주OFD', substationName: '원주', floorId: 'f1' },
      ofdB: { id: 'ofd2', name: '홍천OFD', substationName: '홍천', floorId: 'f2' },
      portCount: 2, description: null, createdAt: '', updatedAt: '',
      ports: [
        { portNumber: 1, sideA: null, sideB: null },
        { portNumber: 2, sideA: { cableId: 'c2', assetId: 'a2', assetName: '송변전광단말' }, sideB: { cableId: 'c2r', assetId: 'r2', assetName: '홍천단말' } },
      ],
    }],
  }),
}));
vi.mock('../../workingCopy/hooks', () => ({
  useEffectiveFiberCores: () => [],
  useEffectiveAssets: () => [{ id: 'ofd1', name: '원주OFD', substationId: 's1', assetType: { placementKind: 'OFD' } }],
}));
vi.mock('../../workspace/selectionStore', () => {
  const st = { selectedAssetId: null, setSelectedAssetId };
  const hook = (sel: (s: unknown) => unknown) => sel(st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { useSelectionStore: hook };
});
vi.mock('../../pathTrace/stores/pathHighlightStore', () => {
  const st = { startTrace, tracingCableId: null };
  const hook = (sel: (s: unknown) => unknown) => sel(st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { usePathHighlightStore: hook };
});
vi.mock('../../workingCopy/substationStore', () => {
  const st = { put, patch, substationId: 's1' };
  const hook = (sel?: (s: unknown) => unknown) => (sel ? sel(st) : st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { useSubstationWorkingCopy: hook };
});

import { OfdFiberRegister } from './OfdFiberRegister';

beforeEach(() => { setSelectedAssetId.mockClear(); startTrace.mockClear(); put.mockClear(); patch.mockClear(); });

describe('OfdFiberRegister', () => {
  it('상대국 섹션 + 코어 행(점유/빈)을 렌더한다', () => {
    render(<OfdFiberRegister ofdId="ofd1" />);
    // 상대국 섹션 헤더(substationName '홍천') — far-side 셀('홍천단말')도 /홍천/ 와 매치하므로 getAllByText.
    expect(screen.getAllByText(/홍천/).length).toBeGreaterThan(0);
    expect(screen.getByText('송변전광단말')).toBeInTheDocument();
  });

  it('점유 코어 클릭 → 근접자산 선택 + startTrace', () => {
    render(<OfdFiberRegister ofdId="ofd1" />);
    fireEvent.click(screen.getByText('송변전광단말'));
    expect(setSelectedAssetId).toHaveBeenCalledWith('a2');
    expect(startTrace).toHaveBeenCalledWith('c2');
  });

  it('빈 메타 코어의 용도 입력 → put(fiberCores, 신규)', () => {
    render(<OfdFiberRegister ofdId="ofd1" />);
    const inputs = screen.getAllByPlaceholderText('용도');
    fireEvent.change(inputs[0], { target: { value: '통합단말' } });
    fireEvent.blur(inputs[0]);
    expect(put).toHaveBeenCalledWith('fiberCores', expect.objectContaining({ fiberPathId: 'fp1', coreNumber: 1, purpose: '통합단말' }));
  });
});
