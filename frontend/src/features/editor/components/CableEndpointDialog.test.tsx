import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// CableEndpointDialog — 케이블 그리기 중 출발/도착 연결점 선택 다이얼로그.
// 셸(phase 게이팅 + 타이틀 + 브레드크럼) + onClose 만 검증한다. 내부뷰는 이미
// resolveSpatialSection / DistributionPanel 테스트가 커버하므로 mock 한다.

const { cancelCableDrawing, setSelectedAssetId } = vi.hoisted(() => ({
  cancelCableDrawing: vi.fn(),
  setSelectedAssetId: vi.fn(),
}));

// 가변 상태 — 각 테스트에서 phase / selectedAssetId 를 바꾼다.
const state = {
  phase: null as string | null,
  selectedAssetId: null as string | null,
};

function asset(p: {
  id: string;
  name: string;
  parent?: string | null;
  role?: string | null;
  floorId?: string | null;
  placed?: boolean;
}) {
  return {
    id: p.id,
    substationId: 's1',
    assetTypeId: 't',
    assetType: {
      id: 't',
      name: 't',
      role: p.role ?? 'device',
    },
    name: p.name,
    parentAssetId: p.parent ?? null,
    floorId: p.floorId ?? null,
    // placed → floorAnchor 가 컨테이너로 인식하도록 좌표/크기 부여.
    positionX: p.placed ? 0 : null,
    positionY: p.placed ? 0 : null,
    width2d: p.placed ? 10 : null,
    height2d: p.placed ? 10 : null,
    roomText: null,

    installDate: null,
    manager: null,
    description: null,
    status: null,
    sortOrder: 0,
    updatedAt: '',
  };
}

// 분전반(placed, distributor) → 피더(자식). 브레드크럼: 분전반 › 전원계통.
const PANEL = 'panel-1';
const FEEDER = 'feeder-1';
const assets = [
  asset({ id: PANEL, name: '분전반', role: 'panel', floorId: 'f1', placed: true }),
  asset({ id: FEEDER, name: '전원계통', parent: PANEL, role: 'feeder' }),
];

vi.mock('../../workingCopy/hooks', () => ({
  useEffectiveAssets: () => assets,
}));

vi.mock('../stores/interactionStore', () => ({
  useCableDrawing: () => (state.phase ? { phase: state.phase } : null),
}));

vi.mock('../../workspace/selectionStore', () => {
  const hook = (sel: (s: unknown) => unknown) =>
    sel({ selectedAssetId: state.selectedAssetId, setSelectedAssetId });
  (hook as unknown as { getState: () => unknown }).getState = () => ({
    selectedAssetId: state.selectedAssetId,
    setSelectedAssetId,
  });
  return { useSelectionStore: hook };
});

vi.mock('../stores/editorStore', () => {
  const hook = () => undefined;
  (hook as unknown as { getState: () => unknown }).getState = () => ({ cancelCableDrawing });
  return { useEditorStore: hook };
});

// 내부뷰는 단순 마커로 대체 — 셸만 검증.
vi.mock('../../assets/components/detail/panels/resolveSpatialSection', () => ({
  resolveSpatialSection: (_kind: string, id: string) => ({
    label: '회로',
    node: <div data-testid="spatial-view">분전반 내부뷰 {id}</div>,
  }),
}));

import { CableEndpointDialog } from './CableEndpointDialog';

describe('CableEndpointDialog', () => {
  beforeEach(() => {
    cancelCableDrawing.mockClear();
    setSelectedAssetId.mockClear();
    state.phase = null;
    state.selectedAssetId = null;
  });

  it('picking phase 가 아니면 다이얼로그가 렌더되지 않는다', () => {
    state.phase = 'drawingPath';
    state.selectedAssetId = PANEL;
    render(<CableEndpointDialog />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('pickingSourceEndpoint + 분전반 선택 → "출발지 선택" 타이틀 + 분전반 내부뷰', () => {
    state.phase = 'pickingSourceEndpoint';
    state.selectedAssetId = PANEL;
    render(<CableEndpointDialog />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('출발지 선택')).toBeInTheDocument();
    expect(screen.getByText('연결할 지점을 클릭하세요')).toBeInTheDocument();
    expect(screen.getByTestId('spatial-view')).toBeInTheDocument();
  });

  it('pickingTargetEndpoint → "도착지 선택" 타이틀', () => {
    state.phase = 'pickingTargetEndpoint';
    state.selectedAssetId = PANEL;
    render(<CableEndpointDialog />);
    expect(screen.getByText('도착지 선택')).toBeInTheDocument();
  });

  it('브레드크럼: 컨테이너 → 현재 노드 체인을 렌더한다(분전반 › 전원계통)', () => {
    state.phase = 'pickingSourceEndpoint';
    state.selectedAssetId = FEEDER; // 드릴다운된 상태
    render(<CableEndpointDialog />);
    // 마지막(현재) 크럼은 비클릭 — 부모 크럼만 버튼.
    const panelCrumb = screen.getByRole('button', { name: '분전반' });
    expect(panelCrumb).toBeInTheDocument();
    expect(screen.getByText('전원계통')).toBeInTheDocument();
    fireEvent.click(panelCrumb);
    expect(setSelectedAssetId).toHaveBeenCalledWith(PANEL);
  });

  it('닫기(onClose) → cancelCableDrawing 호출', () => {
    state.phase = 'pickingSourceEndpoint';
    state.selectedAssetId = PANEL;
    render(<CableEndpointDialog />);
    fireEvent.click(screen.getByLabelText('닫기'));
    expect(cancelCableDrawing).toHaveBeenCalledTimes(1);
  });
});
