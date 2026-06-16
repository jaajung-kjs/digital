import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { startTrace, openTopology, clearHighlight } = vi.hoisted(() => ({
  startTrace: vi.fn(), openTopology: vi.fn(), clearHighlight: vi.fn(),
}));

const node = (label: string, children: unknown[] = []) =>
  ({ id: label, label, kind: 'asset', isSelf: false, isOrigin: false, edgeFiber: false, children });
const groups = [{
  key: '전원', label: '전원', color: '#ef4444',
  components: [{ seedCableId: 'c1', cableIds: ['c1'], nodeIds: ['chg', 't1'], root: node('충전기', [node('단말1')]) }],
}];

vi.mock('../hooks/useAssetConnections', () => ({
  useAssetDiagram: () => ({ groups, isLoading: false }),
}));

vi.mock('../../pathTrace/stores/pathHighlightStore', () => {
  const st = { startTrace, openTopology, clearHighlight, tracingCableId: null };
  const hook = (sel?: (s: unknown) => unknown) => (sel ? sel(st) : st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { usePathHighlightStore: hook };
});

import { AssetConnectionsTab } from './AssetConnectionsTab';

beforeEach(() => { startTrace.mockClear(); openTopology.mockClear(); clearHighlight.mockClear(); });

describe('AssetConnectionsTab', () => {
  it('종류 그룹 + 트리 렌더', () => {
    render(<AssetConnectionsTab assetId="R" />);
    expect(screen.getByText('전원')).toBeInTheDocument();
    expect(screen.getByText('충전기')).toBeInTheDocument();
    expect(screen.getByText('단말1')).toBeInTheDocument();
  });
  it('트리 클릭 → startTrace(seedCableId)', () => {
    render(<AssetConnectionsTab assetId="R" />);
    fireEvent.click(screen.getByText('충전기'));
    expect(startTrace).toHaveBeenCalledWith('c1');
  });
  it('상세 클릭 → startTrace + openTopology', () => {
    render(<AssetConnectionsTab assetId="R" />);
    fireEvent.click(screen.getByRole('button', { name: '상세' }));
    expect(startTrace).toHaveBeenCalledWith('c1');
    expect(openTopology).toHaveBeenCalled();
  });
});
