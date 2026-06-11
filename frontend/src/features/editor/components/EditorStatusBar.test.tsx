import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import { EditorStatusBar } from './EditorStatusBar';
import { useEditorStore } from '../stores/editorStore';
import type { BackgroundDrawing, FloorPlanDetail } from '../../../types/floorPlan';

const bg: BackgroundDrawing = {
  source: { fileName: 'plan.dwg', importedAt: '2026-01-01', fileType: 'DWG' },
  bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
  layers: [],
  paths: [],
  texts: [],
  filled: [],
};

function makeFloorPlan(over: Partial<FloorPlanDetail> = {}): FloorPlanDetail {
  return { backgroundDrawing: null, backgroundOpacity: 0.3, ...over } as FloorPlanDetail;
}

function renderBar(floorPlan?: FloorPlanDetail) {
  const containerRef = createRef<HTMLDivElement>();
  return render(<EditorStatusBar floorPlan={floorPlan} containerRef={containerRef} />);
}

describe('EditorStatusBar', () => {
  beforeEach(() => {
    useEditorStore.getState().resetEditor();
  });

  it('그리드 토글이 setShowGrid 를 호출한다', () => {
    renderBar();
    expect(useEditorStore.getState().showGrid).toBe(true);
    fireEvent.click(screen.getByLabelText('그리드'));
    expect(useEditorStore.getState().showGrid).toBe(false);
  });

  it('스냅 토글이 setGridSnap 를 호출한다', () => {
    renderBar();
    expect(useEditorStore.getState().gridSnap).toBe(true);
    fireEvent.click(screen.getByLabelText('스냅'));
    expect(useEditorStore.getState().gridSnap).toBe(false);
  });

  it('cm 줄자 토글이 setShowLengths 를 호출한다', () => {
    renderBar();
    expect(useEditorStore.getState().showLengths).toBe(false);
    fireEvent.click(screen.getByLabelText('cm 줄자'));
    expect(useEditorStore.getState().showLengths).toBe(true);
  });

  it('줌 % 에 store 의 zoom 값을 표시한다', () => {
    useEditorStore.setState({ zoom: 75 });
    renderBar();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('확대 / 축소 버튼이 zoom 을 ±10 으로 setViewport 한다', () => {
    useEditorStore.setState({ zoom: 100, panX: 0, panY: 0 });
    renderBar();
    fireEvent.click(screen.getByLabelText('확대'));
    expect(useEditorStore.getState().zoom).toBe(110);
    fireEvent.click(screen.getByLabelText('축소'));
    expect(useEditorStore.getState().zoom).toBe(100);
  });

  it('% 클릭 시 100% 로 리셋한다', () => {
    useEditorStore.setState({ zoom: 250 });
    renderBar();
    fireEvent.click(screen.getByLabelText('줌 100%로 리셋'));
    expect(useEditorStore.getState().zoom).toBe(100);
  });

  it('배경이 없으면 투명도 슬라이더를 숨긴다', () => {
    renderBar(makeFloorPlan({ backgroundDrawing: null }));
    expect(screen.queryByLabelText('배경 투명도')).not.toBeInTheDocument();
  });

  it('배경이 있으면 투명도 슬라이더를 보이고 onChange 가 stage 한다', () => {
    renderBar(makeFloorPlan({ backgroundDrawing: bg, backgroundOpacity: 0.3 }));
    const slider = screen.getByLabelText('배경 투명도');
    expect(slider).toBeInTheDocument();
    fireEvent.change(slider, { target: { value: '0.6' } });
    expect(useEditorStore.getState().stagedBackgroundOpacity).toBeCloseTo(0.6);
  });

  it('staged 배경 도면이 있으면 floorPlan 없이도 투명도 슬라이더를 보인다', () => {
    useEditorStore.getState().stageBackgroundDrawing(bg);
    renderBar();
    expect(screen.getByLabelText('배경 투명도')).toBeInTheDocument();
  });

  it('격자 크기 readout 을 표시하고 인라인 편집이 major/minor 를 갱신한다', () => {
    renderBar();
    // 기본 readout: 격자 60 / 10 cm
    const sizeBtn = screen.getByLabelText('격자 크기 설정');
    expect(sizeBtn).toHaveTextContent('격자 60 / 10 cm');
    fireEvent.click(sizeBtn);

    const major = screen.getByLabelText('주 격자 크기');
    fireEvent.change(major, { target: { value: '120' } });
    fireEvent.blur(major);
    expect(useEditorStore.getState().majorGridSize).toBe(120);

    const minor = screen.getByLabelText('보조 격자 크기');
    fireEvent.change(minor, { target: { value: '5' } });
    fireEvent.keyDown(minor, { key: 'Enter' });
    expect(useEditorStore.getState().gridSize).toBe(5);
  });
});
