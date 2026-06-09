import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';

// FloorPlanEditor 는 무겁고(다수 query/store) 마운트 유지 여부만 검증하면 되므로
// 마운트 카운터를 노출하는 가벼운 stub 으로 대체한다. 모듈-레벨 카운터를 mount/
// unmount 마다 증감해, 탭 전환으로 언마운트되면 즉시 드러나게 한다.
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
  SubstationStatusView: () => <div data-testid="status">status</div>,
}));
vi.mock('../features/connections/components/SubstationConnectionsView', () => ({
  SubstationConnectionsView: () => <div data-testid="connections">connections</div>,
}));
vi.mock('../features/workingCopy/WorkingCopyCommitBar', () => ({
  WorkingCopyCommitBar: () => <div data-testid="commit-bar" />,
}));
vi.mock('../features/workspace/useEditorSelectionBridge', () => ({
  useEditorSelectionBridge: () => {},
}));
vi.mock('../features/workingCopy/hooks', () => ({
  useWorkingCopyLoader: () => {},
}));
vi.mock('../features/workspace/useSubstationFloors', () => ({
  useSubstationFloors: () => ({ data: [{ id: 'floor-1', name: '1F' }] }),
}));

import { SubstationWorkspacePage } from './SubstationWorkspacePage';

function renderAt(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/substations/s1${search}`]}>
      <Routes>
        <Route path="/substations/:substationId" element={<SubstationWorkspacePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SubstationWorkspacePage — 탭 전환 시 평면도 마운트 유지', () => {
  beforeEach(() => {
    mountCount = 0;
    liveCount = 0;
  });

  it('현황 탭에서도 에디터는 마운트돼 있고(숨김) 평면도로 가도 재마운트되지 않는다', () => {
    renderAt('?view=status');
    // 기본(현황) 진입에서도 에디터는 마운트 상태(숨김). 1회만 마운트.
    expect(mountCount).toBe(1);
    expect(liveCount).toBe(1);

    // 평면도로 전환 — 같은 에디터가 보여지기만 하고 재마운트되지 않음.
    fireEvent.click(screen.getByText('평면도'));
    expect(mountCount).toBe(1);
    expect(liveCount).toBe(1);
    expect(screen.getByTestId('editor').textContent).toBe('editor:floor-1');
  });

  it('평면도 → 현황 → 평면도 왕복에도 에디터 마운트가 유지된다(상태 보존)', () => {
    renderAt('?view=plan');
    expect(mountCount).toBe(1);
    expect(liveCount).toBe(1);

    fireEvent.click(screen.getByText('현황'));
    // 현황 보는 동안에도 에디터는 살아있어야 한다(언마운트 금지 → resetEditor 안 돔).
    expect(liveCount).toBe(1);
    expect(mountCount).toBe(1);
    expect(screen.getByTestId('status')).toBeTruthy();

    fireEvent.click(screen.getByText('평면도'));
    // 돌아와도 새 마운트 없음 → 뷰포트(zoom/pan) 가 그대로 보존됨.
    expect(mountCount).toBe(1);
    expect(liveCount).toBe(1);
  });
});
