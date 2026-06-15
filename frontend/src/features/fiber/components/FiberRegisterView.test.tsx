import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { setSelectedAssetId, patch, effectiveCables } = vi.hoisted(() => ({
  setSelectedAssetId: vi.fn(),
  patch: vi.fn(),
  effectiveCables: vi.fn(() => [] as unknown[]),
}));

// 슬롯(conduit) 자식이 있는 OFD 자산 + 슬롯 자산 + 빈 케이블 목록 기본 세팅.
const SLOT_ASSET = {
  id: 'slot1',
  name: '슬롯A',
  parentAssetId: 'ofd1',
  substationId: 's1',
  assetType: { connectionKind: 'conduit' },
};
const OFD_ASSET = {
  id: 'ofd1',
  name: '원주OFD',
  substationId: 's1',
  assetType: { placementKind: 'OFD', connectionKind: null },
  parentAssetId: null,
};

vi.mock('../../workingCopy/hooks', () => ({
  useEffectiveAssets: () => [OFD_ASSET, SLOT_ASSET],
  useEffectiveCables: () => [],
}));
vi.mock('../../trace/traceGraph', () => ({
  useTraceGraph: () => ({
    graph: {
      nameById: new Map([['a-near', '송변전광단말'], ['a-far', '홍천단말']]),
      subNameById: new Map([['ofd1', '원주'], ['slot1', '원주']]),
      assets: [],
      cables: [],
    },
    isLoading: false,
  }),
  remoteSlotSubstation: (_slotId: string, _graph: unknown) => '홍천',
}));
vi.mock('../slotRegister', () => ({
  buildSlotCoreRows: (_slot: unknown, _cables: unknown, _graph: unknown) => [
    {
      coreNumber: 1, cableId: null, occupied: false,
      nearAssetId: null, farName: null,
      purpose: null, circuitText: null, spliceType: null, usageOverride: null,
      usage: '미사용',
    },
    {
      coreNumber: 2, cableId: 'c2', occupied: true,
      nearAssetId: 'a-near', farName: '홍천단말',
      purpose: null, circuitText: null, spliceType: null, usageOverride: null,
      usage: '사용',
    },
  ],
}));
vi.mock('../../workspace/selectionStore', () => {
  const st = { selectedAssetId: null, setSelectedAssetId };
  const hook = (sel: (s: unknown) => unknown) => sel(st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { useSelectionStore: hook };
});
vi.mock('../../pathTrace/stores/pathHighlightStore', () => {
  const st = { tracingCableId: null };
  const hook = (sel: (s: unknown) => unknown) => sel(st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { usePathHighlightStore: hook };
});
vi.mock('../../workingCopy/substationStore', () => {
  const st = { patch, substationId: 's1', effectiveCables };
  const hook = (sel?: (s: unknown) => unknown) => (sel ? sel(st) : st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { useSubstationWorkingCopy: hook };
});
vi.mock('../../assets/components/StagedAssetDetailPanel', () => ({
  StagedAssetDetailPanel: () => null,
}));

import { FiberRegisterView } from './FiberRegisterView';

beforeEach(() => { setSelectedAssetId.mockClear(); patch.mockClear(); effectiveCables.mockReturnValue([]); });

describe('OfdFiberRegister', () => {
  it('섹션 헤더(원주 - 홍천)와 코어 행(점유/빈)을 렌더한다', () => {
    render(<FiberRegisterView substationId="s1" />);
    expect(screen.getByText('원주 - 홍천')).toBeInTheDocument();
    expect(screen.getByText('송변전광단말')).toBeInTheDocument();
    expect(screen.getByText('홍천단말')).toBeInTheDocument();
  });

  it('점유 코어 행 클릭 → 근접자산 선택', () => {
    render(<FiberRegisterView substationId="s1" />);
    fireEvent.click(screen.getByText('송변전광단말'));
    expect(setSelectedAssetId).toHaveBeenCalledWith('a-near');
  });

  it('빈 코어 행 클릭 → ofdId 선택(fallback)', () => {
    render(<FiberRegisterView substationId="s1" />);
    // 빈 코어 행 — 코어번호 "1" 셀 클릭
    const coreCells = screen.getAllByText(/^1$/);
    fireEvent.click(coreCells[0]);
    expect(setSelectedAssetId).toHaveBeenCalledWith('ofd1');
  });

  it('점유 코어 용도 ✎ 클릭 → 입력 → blur → patch(cables, cableId, specParams 머지)', () => {
    effectiveCables.mockReturnValue([{ id: 'c2', specParams: { purpose: null } }]);
    render(<FiberRegisterView substationId="s1" />);
    // 용도 ✎ 버튼은 DOM에 존재(opacity만 0) — 코어2(점유, cableId='c2')의 ✎ 버튼: 두 번째(index 1)
    // 코어1은 disabled(cableId 없음)이라 ✎ 없음 — 코어2의 ✎ 버튼이 유일
    const pencilButton = screen.getByRole('button', { name: /용도 수정/ });
    fireEvent.click(pencilButton);
    // 편집모드: input 나타남
    const input = screen.getByPlaceholderText('용도');
    fireEvent.blur(input, { target: { value: '통합단말' } });
    expect(patch).toHaveBeenCalledWith('cables', 'c2', expect.objectContaining({ specParams: expect.objectContaining({ purpose: '통합단말' }) }));
  });
});
