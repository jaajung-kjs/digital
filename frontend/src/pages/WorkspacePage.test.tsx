import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useOrganizationStore } from '../stores/organizationStore';
import { useSelection } from '../features/workspace/SelectionContext';
import { useSelectionStore } from '../features/workspace/selectionStore';
import { useWorkspaceNav } from '../features/workspace/WorkspaceNavContext';

// FloorPlanEditor 는 무겁고(다수 query/store) 마운트 유지/floorId 만 검증하면 되므로
// 마운트 카운터를 노출하는 가벼운 stub 으로 대체한다.
let mountCount = 0;
let liveCount = 0;
vi.mock('../features/editor/components/FloorPlanEditor', () => ({
  FloorPlanEditor: ({ floorId }: { floorId: string }) => {
    useEffect(() => {
      mountCount += 1;
      liveCount += 1;
      return () => { liveCount -= 1; };
    }, []);
    return <div data-testid="editor">editor:{floorId}</div>;
  },
}));

vi.mock('../features/assets/components/SubstationStatusView', () => ({
  SubstationStatusView: ({ substationId }: { substationId: string }) => (
    <div data-testid="status">status:{substationId}</div>
  ),
}));
// NodeStatusView 목: 공유 선택을 트리거하는 버튼을 노출(본부·사업소 자산 선택 시뮬레이션).
vi.mock('../features/assets/components/NodeStatusView', () => ({
  NodeStatusView: ({ nodeType, nodeId }: { nodeType: string; nodeId: string }) => {
    const sel = useSelection();
    return (
      <div data-testid="node-status">
        node-status:{nodeType}:{nodeId}
        <button onClick={() => sel?.setSelectedAssetId('a1')}>자산선택</button>
      </div>
    );
  },
}));
// 연결 뷰 목: gotoAsset(끝점 클릭)을 트리거하는 버튼을 노출 — 타 층 동변전소 / 타 변전소.
vi.mock('../features/connections/components/SubstationConnectionsView', () => ({
  SubstationConnectionsView: ({ substationId }: { substationId: string }) => {
    const nav = useWorkspaceNav();
    return (
      <div data-testid="connections">
        connections:{substationId}
        <button onClick={() => nav?.gotoAsset('cross-floor')}>끝점-타층</button>
        <button onClick={() => nav?.gotoAsset('cross-sub')}>끝점-타변전소</button>
      </div>
    );
  },
}));
vi.mock('../features/workingCopy/WorkingCopyCommitBar', () => ({
  WorkingCopyCommitBar: ({ substationId }: { substationId: string }) => (
    <div data-testid="commit-bar">commit:{substationId}</div>
  ),
}));
vi.mock('../features/workspace/useEditorSelectionBridge', () => ({
  useEditorSelectionBridge: () => {},
}));
vi.mock('../features/workspace/useSubstationFloors', () => ({
  useSubstationFloors: (substationId?: string) => ({
    data: substationId ? [{ id: 'floor-1', name: '1F' }] : [],
  }),
}));

// useEffectiveAssets / useWorkingCopyLoader — 선택 자산 해석용 effective 목록을 주입.
let effectiveAssets: {
  id: string; substationId: string; floorId: string | null;
  parentAssetId?: string | null; positionX?: number | null; positionY?: number | null;
  width2d?: number | null; height2d?: number | null;
}[] = [];
vi.mock('../features/workingCopy/hooks', () => ({
  useWorkingCopyLoader: () => {},
  useEffectiveAssets: () => effectiveAssets,
}));
vi.mock('../features/workingCopy/substationStore', () => ({
  useSubstationWorkingCopy: (sel: (s: { substationId: string | null }) => unknown) =>
    sel({ substationId: null }),
}));

import { WorkspacePage } from './WorkspacePage';

// 현재 URL(경로+쿼리)을 노출하는 프로브 — gotoAsset 라우트 전환 검증용.
function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}{loc.search}</div>;
}

function renderSubstation(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/substations/s1/workspace${search}`]}>
      <Routes>
        <Route path="/substations/:substationId/workspace" element={<WorkspacePage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

function renderHome(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/${search}`]}>
      <Routes>
        <Route path="/" element={<WorkspacePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mountCount = 0;
  liveCount = 0;
  effectiveAssets = [];
  useOrganizationStore.setState({ roots: [], viewingNodeId: null });
  useSelectionStore.setState({ selectedAssetId: null });
});

describe('WorkspacePage — 변전소 노드', () => {
  it('현황 탭에서도 에디터는 마운트돼 있고(숨김) 평면도로 가도 재마운트되지 않는다', () => {
    renderSubstation('?view=status');
    expect(mountCount).toBe(1);
    expect(liveCount).toBe(1);

    fireEvent.click(screen.getByText('평면도'));
    expect(mountCount).toBe(1);
    expect(liveCount).toBe(1);
    expect(screen.getByTestId('editor').textContent).toBe('editor:floor-1');
  });

  it('평면도 → 현황 → 평면도 왕복에도 에디터 마운트가 유지된다(상태 보존)', () => {
    renderSubstation('?view=plan');
    expect(mountCount).toBe(1);
    expect(liveCount).toBe(1);

    fireEvent.click(screen.getByText('현황'));
    expect(liveCount).toBe(1);
    expect(mountCount).toBe(1);
    expect(screen.getByTestId('status').textContent).toBe('status:s1');

    fireEvent.click(screen.getByText('평면도'));
    expect(mountCount).toBe(1);
    expect(liveCount).toBe(1);
  });

  it('변전소 평면도는 자산 없이 첫 층으로 동작한다', () => {
    renderSubstation('?view=plan');
    expect(screen.getByTestId('editor').textContent).toBe('editor:floor-1');
  });
});

describe('WorkspacePage — 본부 노드', () => {
  function seedHq() {
    useOrganizationStore.setState({
      roots: [
        {
          id: 'hq1', name: '본부', type: 'headquarters', parentId: null,
          children: [], childrenLoaded: true, expanded: true,
        } as never,
      ],
      viewingNodeId: 'hq1',
    });
  }

  it('본부 노드도 탭(현황/평면도/연결)을 렌더한다', () => {
    seedHq();
    renderHome('?view=status');
    expect(screen.getByText('현황')).toBeTruthy();
    expect(screen.getByText('평면도')).toBeTruthy();
    expect(screen.getByText('연결')).toBeTruthy();
    expect(screen.getByTestId('node-status').textContent).toContain('node-status:headquarters:hq1');
  });

  it('평면도: 선택 자산이 없으면 안내문을 보인다(에디터 미마운트)', () => {
    seedHq();
    renderHome('?view=plan');
    expect(screen.getByText('현황에서 설비를 선택하면 그 설비의 평면도를 봅니다.')).toBeTruthy();
    expect(screen.queryByTestId('editor')).toBeNull();
  });

  it('평면도: 선택 자산이 있으면 그 자산의 층으로 에디터가 로드된다', () => {
    seedHq();
    effectiveAssets = [{ id: 'a1', substationId: 's9', floorId: 'floor-9', positionX: 0, positionY: 0, width2d: 10, height2d: 10 }];
    renderHome('?view=status');
    // 현황에서 자산 선택 → 공유 선택 a1. 평면도 탭으로 가면 a1 의 층(floor-9) 에디터.
    fireEvent.click(screen.getByText('자산선택'));
    fireEvent.click(screen.getByText('평면도'));
    expect(screen.getByTestId('editor').textContent).toBe('editor:floor-9');
    // 커밋 바는 선택 자산의 변전소(s9)에 바인딩.
    expect(screen.getByTestId('commit-bar').textContent).toBe('commit:s9');
  });

  it('자산 선택 후 다른(빈) 본부로 이동하면 선택이 리셋돼 평면도가 비어 있다', () => {
    seedHq();
    effectiveAssets = [{ id: 'a1', substationId: 's9', floorId: 'floor-9', positionX: 0, positionY: 0, width2d: 10, height2d: 10 }];
    renderHome('?view=status');
    fireEvent.click(screen.getByText('자산선택')); // hq1 에서 a1 선택

    // 자산이 없는 다른 본부(hq2)로 이동 → 활성 노드 변경 → 선택 리셋.
    act(() => {
      useOrganizationStore.setState({
        roots: [{ id: 'hq2', name: '빈 본부', type: 'headquarters', parentId: null, children: [], childrenLoaded: true, expanded: true } as never],
        viewingNodeId: 'hq2',
      });
    });

    fireEvent.click(screen.getByText('평면도'));
    // 이전 자산(a1)의 층으로 가지 않고 안내문(에디터 미마운트).
    expect(screen.queryByTestId('editor')).toBeNull();
    expect(screen.getByText('현황에서 설비를 선택하면 그 설비의 평면도를 봅니다.')).toBeTruthy();
  });
});

describe('WorkspacePage — gotoAsset(연결 끝점 클릭) 단일 내비', () => {
  it('타 층(동일 변전소) 끝점 클릭 → 그 층 평면도 + ?assetId= 포커스로 진입(버그 수정)', () => {
    // s1 의 다른 층(floor-2)에 배치된 끝점. floorAnchor 가 floor-2/s1 로 해소.
    effectiveAssets = [
      { id: 'cross-floor', substationId: 's1', floorId: 'floor-2', positionX: 0, positionY: 0, width2d: 10, height2d: 10 },
    ];
    renderSubstation('?view=connections');
    fireEvent.click(screen.getByText('끝점-타층'));
    // 같은 변전소라 라우트 유지 + 평면도 전환 + 층/포커스 파라미터.
    const loc = screen.getByTestId('loc').textContent!;
    expect(loc).toContain('/substations/s1/workspace');
    expect(loc).toContain('view=plan');
    expect(loc).toContain('floor=floor-2');
    expect(loc).toContain('assetId=cross-floor');
  });

  it('타 변전소 끝점 클릭 → 그 변전소 워크스페이스 평면도로 라우트 이동 + ?assetId=', () => {
    effectiveAssets = [
      { id: 'cross-sub', substationId: 's9', floorId: 'floor-9', positionX: 0, positionY: 0, width2d: 10, height2d: 10 },
    ];
    renderSubstation('?view=connections');
    fireEvent.click(screen.getByText('끝점-타변전소'));
    const loc = screen.getByTestId('loc').textContent!;
    expect(loc).toContain('/substations/s9/workspace');
    expect(loc).toContain('view=plan');
    expect(loc).toContain('floor=floor-9');
    expect(loc).toContain('assetId=cross-sub');
  });
});

describe('WorkspacePage — 빈 상태', () => {
  it('viewingNode 없이 / 로 들어오면 안내문', () => {
    renderHome('');
    expect(screen.getByText('좌측 트리에서 본부·사업소·변전소를 선택하세요.')).toBeTruthy();
  });
});
