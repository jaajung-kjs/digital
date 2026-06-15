import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { setSelectedAssetId, assetsRef, cablesRef } = vi.hoisted(() => ({
  setSelectedAssetId: vi.fn(),
  assetsRef: { current: [] as unknown[] },
  cablesRef: { current: [] as unknown[] },
}));

vi.mock('../../workingCopy/hooks', () => ({
  useEffectiveAssets: () => assetsRef.current,
  useEffectiveCables: () => cablesRef.current,
}));
vi.mock('../../workspace/selectionStore', () => {
  const st = { selectedAssetId: null, setSelectedAssetId };
  const hook = (sel: (s: unknown) => unknown) => sel(st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { useSelectionStore: hook };
});
vi.mock('../../trace/traceGraph', () => ({
  useTraceGraph: () => ({ graph: null, isLoading: false }),
}));
vi.mock('../../pathTrace/stores/pathHighlightStore', () => ({
  usePathHighlightStore: (sel: (s: unknown) => unknown) => sel({ tracingCableId: null }),
}));

import { ConnectionRegisterGrid } from '../../connections/registerGrid/ConnectionRegisterGrid';
import { powerRegisterDescriptor } from '../powerRegisterDescriptor';

beforeEach(() => {
  setSelectedAssetId.mockClear();
  assetsRef.current = [
    { id: 'p1', name: '1번 분전반', substationId: 's1', parentAssetId: null, assetType: { code: 'DIST', placementKind: 'DIST', connectionKind: null } },
    { id: 'f1', name: '피더-A', substationId: 's1', parentAssetId: 'p1', assetType: { code: 'FEEDER', placementKind: null, connectionKind: 'distributor' } },
    { id: 'L1', name: '통합단말장치', substationId: 's1', parentAssetId: null, assetType: { code: 'TERM', placementKind: null, connectionKind: null } },
  ];
  cablesRef.current = [
    { id: 'c1', sourceAssetId: 'f1', targetAssetId: 'L1', sourceRole: 'OUT', targetRole: null, categoryName: 'F-CV 전력케이블', specParams: { cbNumber: 7, capacity: '30A', switchState: 'ON' } },
  ];
});

describe('PanelCircuitView', () => {
  it('피더 섹션 헤더 + CB 행(번호/부하/용량/SW)을 렌더한다', () => {
    render(<ConnectionRegisterGrid substationId="s1" descriptor={powerRegisterDescriptor} />);
    expect(screen.getByText('피더-A')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('통합단말장치')).toBeInTheDocument();
    expect(screen.getByText('30A')).toBeInTheDocument();
    expect(screen.getByText('ON')).toBeInTheDocument();
  });

  it('CB 행 클릭 → 부하(LOAD) 자산 선택', () => {
    render(<ConnectionRegisterGrid substationId="s1" descriptor={powerRegisterDescriptor} />);
    fireEvent.click(screen.getByText('통합단말장치'));
    expect(setSelectedAssetId).toHaveBeenCalledWith('L1');
  });

  it('분전반이 없으면 빈 상태 메시지', () => {
    assetsRef.current = [];
    cablesRef.current = [];
    render(<ConnectionRegisterGrid substationId="s1" descriptor={powerRegisterDescriptor} />);
    expect(screen.getByText('이 변전소에 분전반이 없습니다.')).toBeInTheDocument();
  });
});
