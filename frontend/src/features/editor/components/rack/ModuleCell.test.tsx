import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';

const { onPick, pickState, setSelectedAssetId, openDetail, lastOnClick } = vi.hoisted(() => ({
  onPick: vi.fn(),
  pickState: { active: false, side: null as 'source' | 'target' | null },
  setSelectedAssetId: vi.fn(),
  openDetail: vi.fn(),
  lastOnClick: { fn: (() => {}) as () => void },
}));

const RACK = 'rack1';
const MODULE = { id: 'mod1', name: '모듈A', parentAssetId: RACK, slotIndex: 0, slotSpan: 1 };

// useSlotDrag 의 onClick 을 그대로 노출하는 가짜 트리거 버튼으로 대체 — 포인터 드래그
// 임계값 시뮬레이션 없이 "클릭" 경로(onClick)만 단위 검증한다.
vi.mock('../../hooks/useSlotDrag', () => ({
  useSlotDrag: ({ onClick }: { onClick: () => void }) => {
    lastOnClick.fn = onClick;
    return { handlePointerDown: vi.fn(), dragState: null };
  },
}));
// SlotTile 을 onClick 을 가진 버튼으로 대체(드래그/리사이즈 마크업 불필요).
vi.mock('../../../../components/SlotTile', () => ({
  SlotTile: ({ title, ariaLabel }: { title: string; ariaLabel?: string }) => (
    <button type="button" aria-label={ariaLabel ?? title} data-testid="slot-tile" />
  ),
}));
vi.mock('../../stores/editorStore', () => {
  const st = { openDetail };
  const hook = (sel?: (s: unknown) => unknown) => (sel ? sel(st) : st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { useEditorStore: hook };
});
vi.mock('../../../workspace/SelectionContext', () => ({
  useSelection: () => ({ selectedAssetId: null, setSelectedAssetId }),
}));
vi.mock('../../../workingCopy/substationStore', () => {
  const st = { stageAssetUpdate: vi.fn(), stageAssetDelete: vi.fn() };
  const hook = (sel?: (s: unknown) => unknown) => (sel ? sel(st) : st);
  (hook as unknown as { getState: () => unknown }).getState = () => st;
  return { useSubstationWorkingCopy: hook };
});
vi.mock('../../../workingCopy/hooks', () => ({ useEffectiveAssets: () => [MODULE] }));
vi.mock('../../hooks/useCablePick', () => ({
  useCablePick: () => ({ active: pickState.active, side: pickState.side, onPick }),
}));
// 모듈의 floor anchor = 랙(RACK), 중심좌표 사각형 (x=5,y=5,w=10,h=20) → (10,15).
vi.mock('../../../workingCopy/floorAnchor', () => ({
  floorAnchor: () => ({ id: RACK, positionX: 5, positionY: 5, width2d: 10, height2d: 20 }),
  floorTargetFor: () => ({ x: 5, y: 5, width: 10, height: 20 }),
}));

import { ModuleCell } from './ModuleCell';

function renderCell() {
  const gridRef = createRef<HTMLElement>();
  render(<ModuleCell module={MODULE as never} siblings={[]} gridRef={gridRef} />);
  // 마지막 useSlotDrag 호출에 주입된 onClick 을 꺼내 반환 → 클릭 경로 재현.
  return lastOnClick.fn;
}

beforeEach(() => {
  vi.clearAllMocks();
  pickState.active = false; pickState.side = null;
});

describe('ModuleCell', () => {
  it('일반 모드: 모듈 클릭 → 선택(setSelectedAssetId)', () => {
    const onClick = renderCell();
    expect(screen.getByTestId('slot-tile')).toBeInTheDocument();
    onClick();
    expect(setSelectedAssetId).toHaveBeenCalledWith(MODULE.id);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('피킹 모드: 모듈 클릭 → onPick(랙 anchor + 중심, innerAssetId=모듈, role 없음)', () => {
    pickState.active = true; pickState.side = 'source';
    const onClick = renderCell();
    onClick();
    expect(onPick).toHaveBeenCalledWith({
      containerAssetId: RACK,
      position: { x: 10, y: 15 },
      innerAssetId: MODULE.id,
    });
    expect(setSelectedAssetId).not.toHaveBeenCalled();
  });
});
