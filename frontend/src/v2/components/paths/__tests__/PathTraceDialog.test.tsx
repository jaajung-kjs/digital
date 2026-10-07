import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Network } from '../../../model/networkApi';
import { workingCopyStore as store } from '../../../model/store/workingCopy';
import { useWorkspaceRoute } from '../../../useWorkspaceRoute';
import { LineSheetView } from '../../lines/LineSheetView';
import { PathTraceDialog } from '../PathTraceDialog';
import { LINKS, linkRow, loadSubstations, ORG, serverNetwork } from './fixture';

let server: Network = serverNetwork();
vi.mock('../../../model/networkApi', () => ({
  useNetwork: (id: string | null) => ({ data: id === 'HQ' ? server : undefined, isError: false, refetch: vi.fn() }),
}));
vi.mock('../../../hooks', () => ({ useV2OrgTree: () => ({ data: ORG, isError: false }) }));
vi.mock('../../../model/hooks', () => ({ useCatalog: () => ({ data: { categories: [], rackTypes: [], equipmentTypes: [], media: [], cableTypes: [] } }) }));

const AT = { lineId: 'L1', coreNo: 9, side: 'A' as const };

function Where() {
  const loc = useLocation();
  return <output data-testid="where">{decodeURIComponent(loc.pathname + loc.search)}</output>;
}
function renderDialog(onClose = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/n/BC?view=선번장']}>
      <Routes>
        <Route path="/n/:nodeId" element={<><PathTraceDialog substationId="BC" at={AT} onClose={onClose} /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  );
  return onClose;
}
const dialog = () => screen.getByRole('dialog');
const steps = () => within(dialog()).getAllByTestId('path-step');

beforeEach(() => {
  server = serverNetwork();
  loadSubstations(['BC']);
});

describe('중계경로 추적 창', () => {
  it('제목은 시작 설비 · 포트, 머리 요약은 현장 표기 + 예비회선 배지, 본문은 세로 사슬', () => {
    renderDialog();
    expect(dialog()).toHaveTextContent('중계경로 — RTU 광스위치 · FX-TX:1');
    expect(screen.getByTestId('path-summary')).toHaveTextContent('북춘천-(9)-춘천HP-(20)-화천HP-(1)-화천-(37)-철원');
    expect(within(dialog()).getByText('예비회선')).toBeInTheDocument();
    expect(within(dialog()).queryByText('경로 미완결')).toBeNull();
    const text = steps().map((s) => s.textContent);
    expect(text.slice(0, 5)).toEqual([
      '북춘천S/S · RTU 광스위치 · FX-TX:1',
      'OFD 슬롯 2 · 코어 9',
      '154kV 춘천수력T/L (8.5 km)',
      '춘천H/P · OFD 슬롯 3 · 코어 9',
      '중계 패치',
    ]);
    expect(text).toContain('OFD 슬롯 1 · 코어 20');
    expect(text[text.length - 1]).toBe('철원S/S · RTU');
    /* 국 이름은 굵게. */
    expect(within(steps()[0]!).getByRole('button', { name: '북춘천S/S' })).toHaveClass('font-semibold');
  });

  it('미완결이면 끊긴 곳에 「경로 미완결 — 연결이 없습니다」와 그 코어로 가는 길(그 국 선번장 블록, 기록 쌓기)', () => {
    server = serverNetwork(['k4']);
    const onClose = renderDialog();
    expect(within(dialog()).getByText('경로 미완결')).toBeInTheDocument();
    const last = steps()[steps().length - 1]!;
    expect(last).toHaveTextContent('경로 미완결 — 연결이 없습니다 · 화천S/S · 코어 1');
    fireEvent.click(within(last).getByRole('button', { name: '화천S/S · 코어 1' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/n/HC?view=선번장&line=L3&side=A');
    expect(onClose).toHaveBeenCalled();
  });

  it('저장 전에 등록한 패치가 추적에 든다', () => {
    server = serverNetwork(['k4']);
    loadSubstations(['BC', 'HC'], ['k4']);
    store.getState().create('links', { ...linkRow(LINKS.find((l) => l.id === 'k4')!), id: 'new-k4', updatedAt: '' });
    renderDialog();
    expect(within(dialog()).queryByText('경로 미완결')).toBeNull();
    expect(steps()[steps().length - 1]).toHaveTextContent('철원S/S · RTU');
  });

  it('국 이름·코어를 누르면 그 국 선번장 블록으로 — 이 국이면 판만 바꾼다', () => {
    renderDialog();
    fireEvent.click(within(steps()[3]!).getByRole('button', { name: '코어 9' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/n/CHP?view=선번장&line=L1&side=B');
  });

  it('이 국의 블록이면 같은 주소에서 블록 초점만', () => {
    renderDialog();
    fireEvent.click(within(steps()[0]!).getByRole('button', { name: '북춘천S/S' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/n/BC?view=선번장&line=L1&side=A');
  });
});

describe('선번장 코어 줄에서 연다', () => {
  function Sheet() {
    const route = useWorkspaceRoute();
    return <LineSheetView substationId="BC" selectedEquipmentId={null} onSelectEquipment={vi.fn()} focus={route.block} onFocus={route.focusBlock} onOpenEquipment={vi.fn()} />;
  }
  it('연결이 있는 코어에만 「중계경로」가 서고, 누르면 그 블록 끝에서 추적한다', () => {
    render(
      <MemoryRouter initialEntries={['/n/BC?view=선번장']}>
        <Routes><Route path="/n/:nodeId" element={<Sheet />} /></Routes>
      </MemoryRouter>,
    );
    const row = (no: number) => screen.getByTestId(`sheet-row-${no}`);
    expect(within(row(1)).queryByRole('button', { name: '코어 1 중계경로' })).toBeNull();
    fireEvent.click(within(row(9)).getByRole('button', { name: '코어 9 중계경로' }));
    expect(screen.getByTestId('path-summary')).toHaveTextContent('북춘천-(9)-춘천HP-(20)-화천HP-(1)-화천-(37)-철원');
  });
});
