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
/* 범위 데이터를 받는 노드 — 기본은 본부. */
let scopeId = 'HQ';
let org = ORG;
vi.mock('../../../model/networkApi', () => ({
  useNetwork: (id: string | null) => ({ data: id === scopeId ? server : undefined, isError: false, refetch: vi.fn() }),
}));
vi.mock('../../../hooks', () => ({ useV2OrgTree: () => ({ data: org, isError: false, refetch: vi.fn() }) }));
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
  scopeId = 'HQ';
  org = ORG;
  server = serverNetwork();
  loadSubstations(['BC']);
});

describe('중계경로 추적 창', () => {
  it('제목은 시작 설비 · 포트, 머리 요약은 현장 표기 + 예비회선 배지, 본문은 세로 사슬', () => {
    renderDialog();
    expect(dialog()).toHaveTextContent('중계경로 — RTU 광스위치 · FX-TX:1');
    expect(screen.getByTestId('path-summary')).toHaveTextContent('북춘천(OFD:9)-춘천HP(OFD:20)-화천HP(OFD:1)-화천(OFD:37)-철원');
    expect(within(dialog()).getByText('예비회선')).toBeInTheDocument();
    expect(within(dialog()).queryByText('경로 미완결')).toBeNull();
    const text = steps().map((s) => s.textContent);
    expect(text.slice(0, 5)).toEqual([
      '북춘천S/S · RTU 광스위치 · FX-TX:1',
      'OFD · 슬롯 2 · 어댑터 9 · 코어 9',
      '154kV 춘천수력T/L (8.5 km)',
      '춘천H/P · OFD · 슬롯 3 · 어댑터 9 · 코어 9',
      '중계 패치',
    ]);
    expect(text).toContain('OFD · 슬롯 1 · 어댑터 20 · 코어 20');
    /* 첫 끝 줄의 코어 단추 설명에도 국이 든다(국 이름은 위 줄에 있어 이 줄에는 보이지 않는다). */
    expect(within(steps()[1]!).getByRole('button', { name: '코어 9' })).toHaveAttribute('title', '북춘천S/S 선번장 · 코어 9');
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

  it('조직 트리에 이 국의 본부가 없으면 그 국 범위로 — 「불러오는 중」에 머물지 않는다', () => {
    org = { headquarters: [] };
    scopeId = 'BC';
    renderDialog();
    expect(screen.getByTestId('path-summary')).toHaveTextContent('북춘천(OFD:9)-춘천HP(OFD:20)-화천HP(OFD:1)-화천(OFD:37)-철원');
  });

  it('저장 전에 등록한 패치가 추적에 든다', () => {
    server = serverNetwork(['k4']);
    loadSubstations(['BC', 'HC'], ['k4']);
    store.getState().create('links', { ...linkRow(LINKS.find((l) => l.id === 'k4')!), id: 'new-k4', updatedAt: '' });
    renderDialog();
    expect(within(dialog()).queryByText('경로 미완결')).toBeNull();
    expect(steps()[steps().length - 1]).toHaveTextContent('철원S/S · RTU');
  });

  it('데이터 고리로 끊기면 「경로가 같은 코어로 되돌아옵니다」', () => {
    /* 화천에서 철원 쪽 대신 화천HP 쪽(L3 코어 1 B)으로 되돌리는 패치 — 사슬이 이미 지난 코어로 돌아온다. */
    server = { ...serverNetwork(['k4']), links: [...serverNetwork(['k4']).links.filter((l) => l.id !== 'k3'),
      { id: 'k3', substationId: 'HHP', a: { kind: 'core', lineId: 'L2', no: 20, side: 'B' }, b: { kind: 'core', lineId: 'L3', no: 1, side: 'B' } },
      { id: 'k9', substationId: 'HC', a: { kind: 'core', lineId: 'L3', no: 1, side: 'A' }, b: { kind: 'core', lineId: 'L2', no: 20, side: 'A' } }] };
    renderDialog();
    expect(within(dialog()).getByText(/경로가 같은 코어로 되돌아옵니다/)).toBeInTheDocument();
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
    expect(screen.getByTestId('path-summary')).toHaveTextContent('북춘천(OFD:9)-춘천HP(OFD:20)-화천HP(OFD:1)-화천(OFD:37)-철원');
  });
});
