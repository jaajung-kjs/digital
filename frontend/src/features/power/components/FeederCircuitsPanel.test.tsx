import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

const { patch, stageCableDelete, startCableConnection, gotoAsset, onPick, pickState, inputState, inCable } = vi.hoisted(() => ({
  patch: vi.fn(),
  stageCableDelete: vi.fn(), startCableConnection: vi.fn(), gotoAsset: vi.fn(),
  onPick: vi.fn(),
  // in1 = 입력(IN) 케이블 — commitMeta 의 specParams 머지가 기존 switchState 를 보존하는지 검증용.
  inCable: { id: 'in1', sourceAssetId: 'src1', targetAssetId: 'f1', sourceRole: null, targetRole: 'IN', number: null, specParams: { capacity: '20A', switchState: 'ON' } },
  pickState: { active: false, side: null as 'source' | 'target' | null },
  // buildFeederInput 결과를 테스트마다 제어(null=빈 입력, 객체=점유 입력).
  inputState: { value: null as { cableId: string; sourceAssetId: string | null; sourceName: string | null; capacity: string; switchState: string } | null },
}));

const FEEDER = 'f1';
const DIST = 'dist1';
const FEEDER_ASSET = { id: FEEDER, name: 'L1 조명', parentAssetId: DIST, assetType: { role: 'feeder', code: 'FEEDER' } };
const cb1 = { id: 'c1', sourceAssetId: FEEDER, targetAssetId: 'eqpA', sourceRole: 'OUT', targetRole: null, number: 1, categoryName: 'HIV', categoryId: 'cat1', specParams: { capacity: '20A', switchState: 'ON' } };

vi.mock('../../workingCopy/hooks', () => ({ useEffectiveAssets: () => [FEEDER_ASSET] }));
vi.mock('../../trace/traceGraph', () => ({
  useTraceGraph: () => ({ graph: { cables: [cb1], nameById: new Map([['eqpA', '복도등']]) }, isLoading: false }),
}));
vi.mock('../../workingCopy/substationStore', () => {
  const st = { patch, stageCableDelete, effectiveCables: () => [cb1, inCable] };
  const hook = (sel?: (s: unknown) => unknown) => (sel ? sel(st) : st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { useSubstationWorkingCopy: hook };
});
// 케이블 생성 진입은 단일 함수 startCableConnection 으로 통일됨 — 그 함수를 직접 mock.
vi.mock('../../editor/cableConnection', () => ({ startCableConnection }));
// 분기(buildFeederCircuits/feederGridSlots)는 실제, 입력(buildFeederInput)만 제어.
vi.mock('../feederCircuits', async (importActual) => {
  const actual = await importActual<typeof import('../feederCircuits')>();
  return { ...actual, buildFeederInput: () => inputState.value };
});
vi.mock('../../workspace/WorkspaceNavContext', () => ({
  useWorkspaceNav: () => ({ gotoAsset, gotoFloor: vi.fn() }),
}));
vi.mock('../../cables/hooks/useCableCategories', () => ({ useCableCategories: () => ({ data: [] }) }));
vi.mock('../../editor/hooks/useCablePick', () => ({
  useCablePick: () => ({ active: pickState.active, side: pickState.side, onPick }),
}));
// 피더의 floor anchor = 분전반(DIST), 중심좌표는 사각형 (x=10,y=20,w=40,h=60) → (30,50).
vi.mock('../../workingCopy/floorAnchor', () => ({
  floorAnchor: () => ({ id: DIST, positionX: 10, positionY: 20, width2d: 40, height2d: 60 }),
  floorTargetFor: () => ({ x: 10, y: 20, width: 40, height: 60 }),
}));

import { FeederCircuitsPanel } from './FeederCircuitsPanel';
import { useSelectionStore } from '../../workspace/selectionStore';

beforeEach(() => {
  patch.mockClear();
  stageCableDelete.mockClear(); startCableConnection.mockClear(); gotoAsset.mockClear();
  onPick.mockClear();
  pickState.active = false; pickState.side = null;
  inputState.value = null;
  useSelectionStore.setState({ selectedAssetId: null, selectedCore: null });
});

describe('FeederCircuitsPanel', () => {
  it('점유 차단기 + 빈 자리 추가버튼 렌더', () => {
    render(<FeederCircuitsPanel feederId={FEEDER} />);
    expect(screen.getByRole('button', { name: '차단기 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '차단기 6 추가' })).toBeInTheDocument();
  });
  it('점유 차단기 클릭 → 부하 상세', () => {
    render(<FeederCircuitsPanel feederId={FEEDER} />);
    fireEvent.click(screen.getByRole('button', { name: '차단기 1' }));
    expect(screen.getByText(/복도등/)).toBeInTheDocument();
  });
  it('빈 자리 추가(＋) 클릭 → startCableConnection(피더 OUT + 그 빈 CB 번호) + 평면도 이동(피더)', () => {
    render(<FeederCircuitsPanel feederId={FEEDER} />);
    fireEvent.click(screen.getByRole('button', { name: '차단기 3 추가' }));
    expect(startCableConnection).toHaveBeenCalledWith({
      source: { containerAssetId: DIST, position: { x: 30, y: 50 }, innerAssetId: FEEDER, role: 'OUT', number: 3 },
    });
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

  describe('입력(IN) 모듈', () => {
    it('점유 입력 → 공급원 이름 + 암페어 표시', () => {
      inputState.value = { cableId: 'in1', sourceAssetId: 'src1', sourceName: '한전 인입', capacity: '20A', switchState: 'ON' };
      render(<FeederCircuitsPanel feederId={FEEDER} />);
      const tile = screen.getByRole('button', { name: '입력' });
      expect(within(tile).getByText('한전 인입')).toBeInTheDocument();
      expect(within(tile).getByText('20A')).toBeInTheDocument();
    });
    it('점유 입력 타일 클릭 → 상세카드(공급원/용량/개폐) + 용량 편집 시 commitMeta(in cableId)', () => {
      inputState.value = { cableId: 'in1', sourceAssetId: 'src1', sourceName: '한전 인입', capacity: '20A', switchState: 'ON' };
      render(<FeederCircuitsPanel feederId={FEEDER} />);
      fireEvent.click(screen.getByRole('button', { name: '입력' }));
      expect(screen.getByText('공급원')).toBeInTheDocument();
      // 용량 인라인 편집(✎ 클릭 → 입력) → commitMeta(specParams 머지 patch)는 입력 케이블 id 로.
      fireEvent.click(screen.getByRole('button', { name: '용량 수정' }));
      const inp = screen.getByLabelText('용량') as HTMLInputElement;
      // 용량은 숫자만 입력 → 저장도 숫자만(A 는 표시 전용 자동).
      fireEvent.change(inp, { target: { value: '30' } });
      fireEvent.blur(inp);
      expect(patch).toHaveBeenCalledWith('cables', 'in1', { specParams: { capacity: '30', switchState: 'ON' } });
    });
    it('점유 입력 → 가로 스위치 렌더 + 클릭 시 switchState 반전 패치(stopPropagation: 상세카드 안 열림)', () => {
      inputState.value = { cableId: 'in1', sourceAssetId: 'src1', sourceName: '한전 인입', capacity: '20A', switchState: 'ON' };
      render(<FeederCircuitsPanel feederId={FEEDER} />);
      const sw = screen.getByRole('button', { name: '입력 개폐' });
      expect(sw).toBeInTheDocument();
      fireEvent.click(sw);
      // ON → OFF 반전, specParams 머지 유지.
      expect(patch).toHaveBeenCalledWith('cables', 'in1', { specParams: { capacity: '20A', switchState: 'OFF' } });
      // 스위치 클릭은 타일 열기(상세카드) 를 트리거하지 않는다.
      expect(screen.queryByText('공급원')).not.toBeInTheDocument();
    });
    it('점유 입력 삭제 → 확인 후 stageCableDelete', () => {
      inputState.value = { cableId: 'in1', sourceAssetId: 'src1', sourceName: '한전 인입', capacity: '', switchState: '' };
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      render(<FeederCircuitsPanel feederId={FEEDER} />);
      fireEvent.click(screen.getByRole('button', { name: '입력 삭제' }));
      expect(stageCableDelete).toHaveBeenCalledWith('in1');
      confirmSpy.mockRestore();
    });
    it('빈 입력 → 빨강 "입력 연결" 버튼 + 클릭 시 startCableConnection(IN source)/평면도 이동', () => {
      inputState.value = null;
      render(<FeederCircuitsPanel feederId={FEEDER} />);
      const btn = screen.getByRole('button', { name: '입력 연결' });
      expect(btn).toBeInTheDocument();
      fireEvent.click(btn);
      expect(startCableConnection).toHaveBeenCalledWith({
        source: { containerAssetId: DIST, position: { x: 30, y: 50 }, innerAssetId: FEEDER, role: 'IN' },
      });
      expect(gotoAsset).toHaveBeenCalledWith(FEEDER);
    });
  });

  describe('케이블 피킹 모드(active)', () => {
    beforeEach(() => { pickState.active = true; pickState.side = 'source'; });

    it('점유 CB 클릭 → onPick 안 함(점유된 분기엔 연결 불가, 빈 곳만) — 선택/트레이스도 안 함', () => {
      render(<FeederCircuitsPanel feederId={FEEDER} />);
      fireEvent.click(screen.getByRole('button', { name: '차단기 1' }));
      // 1대다 자산: 이미 케이블이 있는 CB 는 픽되지 않는다.
      expect(onPick).not.toHaveBeenCalled();
      // 일반 동작(부하 상세)도 일어나지 않는다(피킹 모드).
      expect(screen.queryByText(/복도등/)).not.toBeInTheDocument();
    });

    it('빈 칸(＋) 클릭 → onPick(다음 빈 CB 번호) — 케이블 도구 진입 안 함', () => {
      render(<FeederCircuitsPanel feederId={FEEDER} />);
      // CB 1 점유 → 다음 빈 CB = 2.
      fireEvent.click(screen.getByRole('button', { name: '차단기 2 추가' }));
      expect(onPick).toHaveBeenCalledWith(
        expect.objectContaining({ innerAssetId: FEEDER, role: 'OUT', number: 2 }),
      );
      expect(startCableConnection).not.toHaveBeenCalled();
      expect(gotoAsset).not.toHaveBeenCalled();
    });

    it('IN 슬롯 클릭 → onPick(피더 IN, 번호 없음)', () => {
      inputState.value = null; // 빈 입력도 피킹 모드면 IN endpoint pick.
      render(<FeederCircuitsPanel feederId={FEEDER} />);
      fireEvent.click(screen.getByRole('button', { name: '입력 선택' }));
      expect(onPick).toHaveBeenCalledWith({
        containerAssetId: DIST,
        position: { x: 30, y: 50 },
        innerAssetId: FEEDER,
        role: 'IN',
      });
      expect(onPick.mock.calls[0][0]).not.toHaveProperty('number');
      expect(startCableConnection).not.toHaveBeenCalled();
    });

    it('점유 IN 슬롯도 피킹 모드면 onPick(IN) — 삭제 버튼 대신 클릭 타깃', () => {
      inputState.value = { cableId: 'in1', sourceAssetId: 'src1', sourceName: '한전 인입', capacity: '20A', switchState: 'ON' };
      render(<FeederCircuitsPanel feederId={FEEDER} />);
      fireEvent.click(screen.getByRole('button', { name: '입력 선택' }));
      expect(onPick).toHaveBeenCalledWith(
        expect.objectContaining({ innerAssetId: FEEDER, role: 'IN' }),
      );
      expect(stageCableDelete).not.toHaveBeenCalled();
    });
  });
});
