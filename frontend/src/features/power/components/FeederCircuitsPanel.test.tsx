import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { startTrace, clearHighlight, patch, stageCableDelete, setTool, gotoAsset, onPick, pickState } = vi.hoisted(() => ({
  startTrace: vi.fn(), clearHighlight: vi.fn(), patch: vi.fn(),
  stageCableDelete: vi.fn(), setTool: vi.fn(), gotoAsset: vi.fn(),
  onPick: vi.fn(),
  pickState: { active: false, side: null as 'source' | 'target' | null },
}));

const FEEDER = 'f1';
const DIST = 'dist1';
const FEEDER_ASSET = { id: FEEDER, name: 'L1 조명', parentAssetId: DIST, assetType: { connectionKind: 'distributor', code: 'FEEDER' } };
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
  const st = { patch, stageCableDelete, effectiveCables: () => [cb1] };
  const hook = (sel?: (s: unknown) => unknown) => (sel ? sel(st) : st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { useSubstationWorkingCopy: hook };
});
vi.mock('../../editor/stores/editorStore', () => {
  const st = { setTool };
  const hook = (sel?: (s: unknown) => unknown) => (sel ? sel(st) : st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { useEditorStore: hook };
});
vi.mock('../../workspace/WorkspaceNavContext', () => ({
  useWorkspaceNav: () => ({ gotoAsset, gotoFloor: vi.fn() }),
}));
vi.mock('../../cables/hooks/useCableCategories', () => ({ useCableCategories: () => ({ data: [] }) }));
vi.mock('../../editor/hooks/useCablePick', () => ({
  useCablePick: () => ({ active: pickState.active, side: pickState.side, pendingContainerId: null, onPick }),
}));
// 피더의 floor anchor = 분전반(DIST), 중심좌표는 사각형 (x=10,y=20,w=40,h=60) → (30,50).
vi.mock('../../workingCopy/floorAnchor', () => ({
  floorAnchor: () => ({ id: DIST, positionX: 10, positionY: 20, width2d: 40, height2d: 60 }),
  floorTargetFor: () => ({ x: 10, y: 20, width: 40, height: 60 }),
}));

import { FeederCircuitsPanel } from './FeederCircuitsPanel';
import { useSelectionStore } from '../../workspace/selectionStore';

beforeEach(() => {
  startTrace.mockClear(); clearHighlight.mockClear(); patch.mockClear();
  stageCableDelete.mockClear(); setTool.mockClear(); gotoAsset.mockClear();
  onPick.mockClear();
  pickState.active = false; pickState.side = null;
  useSelectionStore.setState({ selectedAssetId: null, selectedCore: null });
});

describe('FeederCircuitsPanel', () => {
  it('점유 차단기 + 빈 자리 추가버튼 렌더', () => {
    render(<FeederCircuitsPanel feederId={FEEDER} />);
    expect(screen.getByRole('button', { name: '차단기 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '차단기 6 추가' })).toBeInTheDocument();
  });
  it('점유 차단기 클릭 → 부하 상세 + startTrace(cableId)', () => {
    render(<FeederCircuitsPanel feederId={FEEDER} />);
    fireEvent.click(screen.getByRole('button', { name: '차단기 1' }));
    expect(screen.getByText(/복도등/)).toBeInTheDocument();
    expect(startTrace).toHaveBeenCalledWith('c1');
  });
  it('빈 자리 추가(＋) 클릭 → 케이블 도구 + 평면도 이동(피더)', () => {
    render(<FeederCircuitsPanel feederId={FEEDER} />);
    fireEvent.click(screen.getByRole('button', { name: '차단기 3 추가' }));
    expect(setTool).toHaveBeenCalledWith('cable');
    expect(gotoAsset).toHaveBeenCalledWith(FEEDER);
  });
  it('점유 차단기 삭제 → 확인 후 stageCableDelete(cableId)', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<FeederCircuitsPanel feederId={FEEDER} />);
    fireEvent.click(screen.getByRole('button', { name: '차단기 1 삭제' }));
    expect(stageCableDelete).toHaveBeenCalledWith('c1');
    confirmSpy.mockRestore();
  });
  it('점유 차단기 토글 → switchState 패치(ON↔OFF, specParams 머지)', () => {
    render(<FeederCircuitsPanel feederId={FEEDER} />);
    fireEvent.click(screen.getByRole('button', { name: '차단기 1 개폐' }));
    expect(patch).toHaveBeenCalledWith('cables', 'c1', { specParams: { capacity: '20A', switchState: 'OFF' } });
  });

  describe('케이블 피킹 모드(active)', () => {
    beforeEach(() => { pickState.active = true; pickState.side = 'source'; });

    it('점유 CB 클릭 → onPick(피더 OUT, 그 CB 번호) — 선택/트레이스 안 함', () => {
      render(<FeederCircuitsPanel feederId={FEEDER} />);
      fireEvent.click(screen.getByRole('button', { name: '차단기 1' }));
      expect(onPick).toHaveBeenCalledWith({
        containerAssetId: DIST,
        position: { x: 30, y: 50 },
        innerAssetId: FEEDER,
        role: 'OUT',
        number: 1,
      });
      // 일반 동작(부하 상세/트레이스)은 일어나지 않는다.
      expect(startTrace).not.toHaveBeenCalled();
      expect(screen.queryByText(/복도등/)).not.toBeInTheDocument();
    });

    it('빈 칸(＋) 클릭 → onPick(다음 빈 CB 번호) — 케이블 도구 진입 안 함', () => {
      render(<FeederCircuitsPanel feederId={FEEDER} />);
      // CB 1 점유 → 다음 빈 CB = 2.
      fireEvent.click(screen.getByRole('button', { name: '차단기 2 추가' }));
      expect(onPick).toHaveBeenCalledWith(
        expect.objectContaining({ innerAssetId: FEEDER, role: 'OUT', number: 2 }),
      );
      expect(setTool).not.toHaveBeenCalled();
      expect(gotoAsset).not.toHaveBeenCalled();
    });
  });
});
