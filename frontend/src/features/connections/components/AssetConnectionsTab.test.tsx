import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { setSelectedComponent, selection } = vi.hoisted(() => ({
  setSelectedComponent: vi.fn(),
  selection: { selectedAssetId: null as string | null, selectedCore: null as number | null, selectedCableId: null as string | null },
}));

// 명세 리스트는 effective assets + trace graph + 카테고리에서 파생.
const assets = [
  { id: 'dev', name: '송변전광단말', parentAssetId: null, assetType: { code: null, placementKind: null, connectionKind: null } },
  { id: 'slot', name: 'OFD슬롯3', parentAssetId: 'ofd', assetType: { code: null, placementKind: null, connectionKind: 'conduit' } },
];
const cables = [
  { id: 'core1', sourceAssetId: 'slot', targetAssetId: 'dev', sourceRole: 'OUT', targetRole: null, number: 1, categoryId: 'c-fiber', cableType: 'FIBER' },
];

vi.mock('../../workingCopy/hooks', () => ({ useEffectiveAssets: () => assets }));
vi.mock('../../trace/traceGraph', () => ({
  useTraceGraph: () => ({
    graph: {
      cables,
      assets,
      nameById: new Map(assets.map((a) => [a.id, a.name])),
      subNameById: new Map(), subById: new Map(),
      parentById: new Map(assets.map((a) => [a.id, a.parentAssetId])),
      kindById: new Map(), codeById: new Map(), placementKindById: new Map(), slotIndexById: new Map(),
    },
    isLoading: false,
  }),
  remoteSlotSubstation: () => null,
}));
vi.mock('../../cables/hooks/useCableCategories', () => ({
  useCableCategories: () => ({ data: [{ id: 'c-fiber', code: 'OPJ', name: '광점퍼', displayColor: '#a78bfa', displayGroup: '광', groupId: 'g-fiber', groupName: '광', groupColor: '#22c55e', isActive: true }] }),
}));
// CableInspector 는 별도 단위 — 여기선 리스트/선택만 검증하므로 스텁.
vi.mock('../../cables/components/CableInspector', () => ({
  CableInspector: ({ cableId }: { cableId: string }) => <div data-testid="cable-inspector">{cableId}</div>,
}));

vi.mock('../../workspace/selectionStore', () => {
  const st = {
    get selectedAssetId() { return selection.selectedAssetId; },
    get selectedCore() { return selection.selectedCore; },
    get selectedCableId() { return selection.selectedCableId; },
    setSelectedComponent,
    setSelectedAssetId: vi.fn(),
    setSelected: vi.fn(),
  };
  const hook = (sel?: (s: unknown) => unknown) => (sel ? sel(st) : st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { useSelectionStore: hook };
});

import { AssetConnectionsTab } from './AssetConnectionsTab';

beforeEach(() => {
  setSelectedComponent.mockClear();
  selection.selectedAssetId = null; selection.selectedCore = null; selection.selectedCableId = null;
});

describe('AssetConnectionsTab (케이블 명세 리스트)', () => {
  it('종류 섹션 + 케이블 행 렌더(from→to)', () => {
    render(<AssetConnectionsTab assetId="dev" />);
    expect(screen.getByText('광')).toBeInTheDocument(); // 섹션 라벨 = 카테고리 displayGroup
    // dev 관점 → self(송변전광단말) 가 먼저. 행 접근명 = "송변전광단말 → OFD슬롯3 …"
    expect(screen.getByRole('button', { name: /송변전광단말.*OFD슬롯3/ })).toBeInTheDocument();
  });

  it('행 클릭 → setSelectedComponent(assetId, number, cableId)', () => {
    render(<AssetConnectionsTab assetId="dev" />);
    fireEvent.click(screen.getByRole('button', { name: /송변전광단말.*OFD슬롯3/ }));
    expect(setSelectedComponent).toHaveBeenCalledWith('dev', 1, 'core1');
  });

  it('selectedCableId 일치 시 하단 선택 카드(CableInspector) 노출', () => {
    selection.selectedCableId = 'core1';
    render(<AssetConnectionsTab assetId="dev" />);
    expect(screen.getByTestId('cable-inspector')).toHaveTextContent('core1');
  });
});
