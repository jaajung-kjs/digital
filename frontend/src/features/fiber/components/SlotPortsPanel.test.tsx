import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { onPick, pickState, startCableConnection, gotoAsset } = vi.hoisted(() => ({
  onPick: vi.fn(),
  pickState: { active: false, side: null as 'source' | 'target' | null },
  startCableConnection: vi.fn(),
  gotoAsset: vi.fn(),
}));

const SLOT = 'slotA';
const TWIN = 'slotB';
const OFD = 'ofd1';
const SLOT_ASSET = { id: SLOT, name: '슬롯A', parentAssetId: OFD, assetType: { role: 'slot', code: 'OFD-SLOT' } };
const opgw = { id: 'opgw', sourceAssetId: SLOT, targetAssetId: TWIN, sourceRole: 'IN', targetRole: 'IN', specParams: { cores: 24 } };
const localOut3 = { id: 'c-l3', sourceAssetId: 'eqpL', targetAssetId: SLOT, sourceRole: null, targetRole: 'OUT', number: 3 };

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
vi.mock('../../editor/hooks/useCablePick', () => ({
  useCablePick: () => ({ active: pickState.active, side: pickState.side, onPick }),
}));
vi.mock('../../editor/cableConnection', () => ({ startCableConnection }));
vi.mock('../../workspace/WorkspaceNavContext', () => ({
  useWorkspaceNav: () => ({ gotoAsset }),
}));
// 슬롯의 floor anchor = OFD, 중심좌표는 사각형 (x=100,y=200,w=20,h=40) → (110,220).
vi.mock('../../workingCopy/floorAnchor', () => ({
  floorAnchor: () => ({ id: OFD, positionX: 100, positionY: 200, width2d: 20, height2d: 40 }),
  floorTargetFor: () => ({ x: 100, y: 200, width: 20, height: 40 }),
}));

import { SlotPortsPanel } from './SlotPortsPanel';
import { useSelectionStore } from '../../workspace/selectionStore';

beforeEach(() => {
  onPick.mockClear();
  startCableConnection.mockClear();
  gotoAsset.mockClear();
  pickState.active = false; pickState.side = null;
  // 선택 코어는 전역 store(SSOT) — 테스트 간 누수 방지로 리셋.
  useSelectionStore.setState({ selectedAssetId: null, selectedCore: null });
});

describe('SlotPortsPanel', () => {
  it('24포트 매트릭스를 렌더한다', () => {
    render(<SlotPortsPanel slotId={SLOT} />);
    expect(screen.getByRole('button', { name: /포트 24/ })).toBeInTheDocument();
  });

  it('점유 포트 클릭 → 자국 설비명 상세', () => {
    render(<SlotPortsPanel slotId={SLOT} />);
    fireEvent.click(screen.getByRole('button', { name: /포트 3/ }));
    expect(screen.getByText(/자국장비/)).toBeInTheDocument();
  });

  it('빈 포트 클릭 → 미연결 표시', () => {
    render(<SlotPortsPanel slotId={SLOT} />);
    fireEvent.click(screen.getByRole('button', { name: /^포트 1$/ }));
    // "미연결" 은 PortGrid 범례에도 상존 → 선택 포트 상세 카드 내부의 라벨만 검증.
    const card = screen.getByText(/^포트 1$/).closest('div')!;
    expect(card).toHaveTextContent(/미연결/);
  });

  it('빈 자국 포트 선택 → 케이블 연결 버튼 → startCableConnection(슬롯 OUT) + 평면도 이동', () => {
    render(<SlotPortsPanel slotId={SLOT} />);
    fireEvent.click(screen.getByRole('button', { name: /^포트 1$/ }));
    const connectBtn = screen.getByRole('button', { name: /케이블 연결/ });
    fireEvent.click(connectBtn);
    expect(startCableConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({ slotId: SLOT, coreNumber: 1, role: 'OUT' }),
      }),
    );
    expect(gotoAsset).toHaveBeenCalledWith(SLOT);
  });

  it('점유(자국 OUT) 포트 선택 → 케이블 연결 버튼 없음', () => {
    render(<SlotPortsPanel slotId={SLOT} />);
    fireEvent.click(screen.getByRole('button', { name: /^포트 3$/ }));
    expect(screen.queryByRole('button', { name: /케이블 연결/ })).not.toBeInTheDocument();
  });

  describe('케이블 피킹 모드(active)', () => {
    beforeEach(() => { pickState.active = true; pickState.side = 'source'; });

    it('빈 포트 클릭 → onPick(슬롯 OUT, 코어 번호) — 선택 안 함', () => {
      render(<SlotPortsPanel slotId={SLOT} />);
      fireEvent.click(screen.getByRole('button', { name: /^포트 1$/ }));
      expect(onPick).toHaveBeenCalledWith({
        containerAssetId: OFD,
        position: { x: 110, y: 220 },
        slotId: SLOT,
        coreNumber: 1,
        role: 'OUT',
      });
      // 일반 동작(상세)은 일어나지 않는다.
      expect(screen.queryByText(/자국장비/)).not.toBeInTheDocument();
    });

    it('점유(자국 측) 포트 클릭 → onPick 안 함(빈 포트에만 연결)', () => {
      render(<SlotPortsPanel slotId={SLOT} />);
      // 포트 3 = 자국 OUT 케이블 점유(localCableId 있음) → 픽 불가.
      fireEvent.click(screen.getByRole('button', { name: /^포트 3$/ }));
      expect(onPick).not.toHaveBeenCalled();
    });
  });
});
