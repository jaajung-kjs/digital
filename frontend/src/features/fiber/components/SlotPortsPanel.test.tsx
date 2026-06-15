import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { startTrace, clearHighlight } = vi.hoisted(() => ({
  startTrace: vi.fn(),
  clearHighlight: vi.fn(),
}));

const SLOT = 'slotA';
const TWIN = 'slotB';
const SLOT_ASSET = { id: SLOT, name: '슬롯A', parentAssetId: 'ofd1', assetType: { connectionKind: 'conduit', code: 'OFD-SLOT' } };
const opgw = { id: 'opgw', cableType: 'FIBER', sourceAssetId: SLOT, targetAssetId: TWIN, sourceRole: 'IN', targetRole: 'IN', specParams: { cores: 24 } };
const localOut3 = { id: 'c-l3', cableType: 'FIBER', sourceAssetId: 'eqpL', targetAssetId: SLOT, sourceRole: null, targetRole: 'OUT', number: 3 };

vi.mock('../../workingCopy/hooks', () => ({
  useEffectiveAssets: () => [SLOT_ASSET],
}));
vi.mock('../../trace/traceGraph', () => ({
  useTraceGraph: () => ({
    graph: {
      assets: [], cables: [opgw, localOut3],
      nameById: new Map([['eqpL', '자국장비']]),
      subNameById: new Map([['eqpL', '원주변전소']]),
      parentById: new Map(), codeById: new Map(),
    },
    isLoading: false,
  }),
}));
vi.mock('../../pathTrace/stores/pathHighlightStore', () => {
  const st = { startTrace, clearHighlight };
  const hook = (sel?: (s: unknown) => unknown) => (sel ? sel(st) : st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { usePathHighlightStore: hook };
});

import { SlotPortsPanel } from './SlotPortsPanel';

beforeEach(() => {
  startTrace.mockClear();
  clearHighlight.mockClear();
});

describe('SlotPortsPanel', () => {
  it('24포트 매트릭스를 렌더한다', () => {
    render(<SlotPortsPanel slotId={SLOT} />);
    expect(screen.getByRole('button', { name: /포트 24/ })).toBeInTheDocument();
  });

  it('점유 포트 클릭 → 자국 설비명 상세 + startTrace(localCableId)', () => {
    render(<SlotPortsPanel slotId={SLOT} />);
    fireEvent.click(screen.getByRole('button', { name: /포트 3/ }));
    expect(screen.getByText(/자국장비/)).toBeInTheDocument();
    expect(startTrace).toHaveBeenCalledWith('c-l3');
  });

  it('빈 포트 클릭 → clearHighlight + 미연결 표시', () => {
    render(<SlotPortsPanel slotId={SLOT} />);
    fireEvent.click(screen.getByRole('button', { name: /^포트 1$/ }));
    expect(clearHighlight).toHaveBeenCalled();
    // "미연결" 은 PortGrid 범례에도 상존 → 선택 포트 상세 카드 내부의 라벨만 검증.
    const card = screen.getByText(/^포트 1$/).closest('div')!;
    expect(card).toHaveTextContent(/미연결/);
  });
});
