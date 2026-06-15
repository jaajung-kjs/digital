import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { startTrace, clearHighlight, patch } = vi.hoisted(() => ({
  startTrace: vi.fn(), clearHighlight: vi.fn(), patch: vi.fn(),
}));

const FEEDER = 'f1';
const FEEDER_ASSET = { id: FEEDER, name: 'L1 조명', parentAssetId: 'dist1', assetType: { connectionKind: 'distributor', code: 'FEEDER' } };
const cb1 = { id: 'c1', sourceAssetId: FEEDER, targetAssetId: 'eqpA', sourceRole: 'OUT', targetRole: null, number: 1, categoryName: 'HIV', categoryId: 'cat1', specParams: { capacity: '20A', switchState: 'ON' } };

vi.mock('../../workingCopy/hooks', () => ({ useEffectiveAssets: () => [FEEDER_ASSET] }));
vi.mock('../../trace/traceGraph', () => ({
  useTraceGraph: () => ({ graph: { cables: [cb1], nameById: new Map([['eqpA', '복도등']]) }, isLoading: false }),
}));
vi.mock('../../pathTrace/stores/pathHighlightStore', () => {
  const st = { startTrace, clearHighlight };
  const hook = (sel?: (s: unknown) => unknown) => (sel ? sel(st) : st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { usePathHighlightStore: hook };
});
vi.mock('../../workingCopy/substationStore', () => {
  const st = { patch, effectiveCables: () => [cb1] };
  const hook = (sel?: (s: unknown) => unknown) => (sel ? sel(st) : st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { useSubstationWorkingCopy: hook };
});
vi.mock('../../cables/hooks/useCableCategories', () => ({ useCableCategories: () => ({ data: [] }) }));

import { FeederCircuitsPanel } from './FeederCircuitsPanel';

beforeEach(() => { startTrace.mockClear(); clearHighlight.mockClear(); patch.mockClear(); });

describe('FeederCircuitsPanel', () => {
  it('차단기 레일을 렌더(1..N)', () => {
    render(<FeederCircuitsPanel feederId={FEEDER} />);
    expect(screen.getByRole('button', { name: '차단기 6' })).toBeInTheDocument();
  });
  it('점유 차단기 클릭 → 부하 상세 + startTrace(cableId)', () => {
    render(<FeederCircuitsPanel feederId={FEEDER} />);
    fireEvent.click(screen.getByRole('button', { name: '차단기 1' }));
    expect(screen.getByText(/복도등/)).toBeInTheDocument();
    expect(startTrace).toHaveBeenCalledWith('c1');
  });
  it('빈 차단기 클릭 → clearHighlight + 미연결', () => {
    render(<FeederCircuitsPanel feederId={FEEDER} />);
    fireEvent.click(screen.getByRole('button', { name: '차단기 3' }));
    expect(clearHighlight).toHaveBeenCalled();
    expect(screen.getByText(/미연결/)).toBeInTheDocument();
  });
  it('점유 차단기 토글 → switchState 패치(ON↔OFF, specParams 머지)', () => {
    render(<FeederCircuitsPanel feederId={FEEDER} />);
    fireEvent.click(screen.getByRole('button', { name: '차단기 1 개폐' }));
    expect(patch).toHaveBeenCalledWith('cables', 'c1', { specParams: { capacity: '20A', switchState: 'OFF' } });
  });
});
