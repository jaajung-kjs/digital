import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { startTrace, openTopology, clearHighlight } = vi.hoisted(() => ({
  startTrace: vi.fn(),
  openTopology: vi.fn(),
  clearHighlight: vi.fn(),
}));

const groups = [
  {
    key: '광',
    label: '광',
    color: '#a0f',
    rows: [{ cableId: 'c1', fromName: '송광치', toName: 'OFD#1' }],
  },
];

vi.mock('../hooks/useAssetConnections', () => ({
  useAssetConnections: () => ({ groups, isLoading: false }),
}));

vi.mock('../../pathTrace/stores/pathHighlightStore', () => {
  const st = { startTrace, openTopology, clearHighlight, tracingCableId: null };
  const hook = (sel?: (s: unknown) => unknown) => (sel ? sel(st) : st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { usePathHighlightStore: hook };
});

vi.mock('../../pathTrace/components/PathTraceDetail', () => ({
  PathTraceDetail: () => <div data-testid="path-detail" />,
}));

import { AssetConnectionsTab } from './AssetConnectionsTab';

beforeEach(() => {
  startTrace.mockClear();
  openTopology.mockClear();
  clearHighlight.mockClear();
});

describe('AssetConnectionsTab', () => {
  it('종류 그룹 + 출발→도착 행 렌더', () => {
    render(<AssetConnectionsTab assetId="R" />);
    expect(screen.getByText('광')).toBeInTheDocument();
    expect(screen.getByText(/송광치/)).toBeInTheDocument();
    expect(screen.getByText(/OFD#1/)).toBeInTheDocument();
  });

  it('행 클릭 → startTrace(cableId)', () => {
    render(<AssetConnectionsTab assetId="R" />);
    fireEvent.click(screen.getByRole('button', { name: /송광치.*OFD#1/ }));
    expect(startTrace).toHaveBeenCalledWith('c1');
  });

  it('상세 클릭 → startTrace + openTopology', () => {
    render(<AssetConnectionsTab assetId="R" />);
    fireEvent.click(screen.getByRole('button', { name: '상세' }));
    expect(startTrace).toHaveBeenCalledWith('c1');
    expect(openTopology).toHaveBeenCalled();
  });
});
