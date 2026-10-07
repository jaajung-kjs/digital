import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { workingCopyStore as store } from '../../../model/store/workingCopy';
import type { Equipment, Link } from '../../../model/types';
import { useWorkspaceRoute, VIEW_MODES } from '../../../useWorkspaceRoute';
import { CircuitCard } from '../../equipment/CircuitCard';
import { PowerView } from '../PowerView';

vi.mock('../../../model/hooks', () => ({
  useCatalog: () => ({ data: { categories: [], rackTypes: [], equipmentTypes: [], media: [], cableTypes: [{ id: 'fcv', key: 'a', name: 'F-CV 2.5sq', medium: 'power', sortOrder: 1 }] } }),
}));

const eq = (id: string, name: string, circuitCount = 0): Equipment => ({
  id, substationId: 'S1', rackId: 'r', name, typeId: 't', status: 'normal', model: null, maker: null, madeOn: null, serial: null,
  installDate: null, manager: null, note: null, circuitCount, panelCount: null, updatedAt: '',
});
const link = (id: string, a: Link['a'], b: Link['b'], o: Partial<Link> = {}): Link => ({
  id, substationId: 'S1', cableTypeId: null, lengthM: null, spec: null, note: null, pathPoints: [], a, b, updatedAt: '', ...o,
});

/** 소내전원반(4 → 통신용 분전반) · 통신용 분전반(1 교류 → 충전기 AC IN, 2 직류 예비, 3 예비). */
beforeEach(() => {
  store.getState().reset();
  const s = store.getState();
  s.create('racks', { id: 'r', substationId: 'S1', name: '랙', rackTypeId: 'rt', floorId: null, x: null, y: null, width: null, height: null, facing: null, updatedAt: '' });
  s.create('equipment', eq('panel', '소내전원반', 4));
  s.create('equipment', eq('dist', '통신용 분전반', 3));
  s.create('equipment', eq('chg', '충전기'));
  s.updateCircuit('panel', 4, { current: 'AC', label: '통신용' });
  s.updateCircuit('dist', 1, { current: 'AC', label: 'MCCB1', purpose: '충전기 전원' });
  s.updateCircuit('dist', 2, { current: 'DC' });
  s.create('links', link('k1', { kind: 'circuit', equipmentId: 'panel', no: 4 }, { kind: 'equipment', equipmentId: 'dist' }));
  s.create('links', link('k2', { kind: 'circuit', equipmentId: 'dist', no: 1 }, { kind: 'equipment', equipmentId: 'chg', label: 'AC IN' }, { cableTypeId: 'fcv', lengthM: 12 }));
});

function Harness() {
  const route = useWorkspaceRoute();
  const loc = useLocation();
  return (
    <>
      <span data-testid="loc">{new URLSearchParams(loc.search).toString().replace(/\+/g, ' ').split('&').map(decodeURIComponent).join('&')}</span>
      {VIEW_MODES.map((v) => <button key={v} type="button" role="tab" onClick={() => route.setView(v)}>{v}</button>)}
      {route.view === '전원 계통' && (
        <PowerView
          substationId="S1" view={route.power} onView={route.setPowerView} focus={route.supply}
          selectedEquipmentId={route.eqId} onSelectSupply={route.selectSupply} onSelectEquipment={route.selectEquipment}
        />
      )}
      {/* 상세 패널의 차단기 요약 — 같은 워킹카피를 읽는다. */}
      <CircuitCard equipmentId="dist" onEdit={() => undefined} onAdd={() => undefined} />
    </>
  );
}
const renderPower = (path = '/n/S1?view=전원 계통') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/n/:nodeId" element={<Harness />} /></Routes>
  </MemoryRouter>,
);
const blocks = () => screen.queryAllByTestId('ledger-block');
const blockOf = (id: string) => blocks().find((b) => b.dataset.equipment === id)!;
const rowOf = (id: string, no: number) => within(blockOf(id)).getByTestId(`ledger-row-${no}`);
const cell = (row: HTMLElement, col: string) => row.querySelector<HTMLElement>(`[data-col="${col}"]`)!;

describe('전원 계통 — 차단기 대장', () => {
  it('탭 「전원 계통」 — 판 차례는 평면도 앞, 누르면 주소가 view=전원 계통', () => {
    renderPower('/n/S1');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['현황', '선번장', '전원 계통', '평면도']);
    fireEvent.click(screen.getByRole('tab', { name: '전원 계통' }));
    expect(screen.getByTestId('loc')).toHaveTextContent('view=전원 계통');
    expect(screen.getByRole('radio', { name: '차단기 대장' })).toBeChecked();
  });

  it('블록 = 차단기가 있는 설비, 이름 순 — 머리에 차단기 수와 갈래별 입력 전원(없으면 흐린 「입력 전원 미등록」)', () => {
    renderPower();
    expect(blocks().map((b) => b.dataset.equipment)).toEqual(['panel', 'dist']);
    const distHead = within(blockOf('dist')).getByTestId('ledger-block-head');
    expect(distHead).toHaveTextContent('통신용 분전반');
    expect(distHead).toHaveTextContent('차단기 3');
    expect(distHead).toHaveTextContent('교류 입력: 소내전원반 차단기 4');
    const panelHead = within(blockOf('panel')).getByTestId('ledger-block-head');
    const unfed = within(panelHead).getByText('입력 전원 미등록');
    expect(unfed).toHaveClass('text-content-muted');
    expect(unfed).not.toHaveClass('text-warning');
  });

  it('입력 전원은 받는 차단기의 갈래로 묶고, 교류/직류 보기에서는 그 갈래만', () => {
    const s = store.getState();
    s.update('equipment', 'chg', { circuitCount: 1 });
    s.create('links', link('k3', { kind: 'circuit', equipmentId: 'chg', no: 1 }, { kind: 'equipment', equipmentId: 'dist', label: 'DC IN' }));
    s.create('equipment', eq('ups', 'UPS', 1));
    s.create('links', link('k4', { kind: 'circuit', equipmentId: 'ups', no: 1 }, { kind: 'equipment', equipmentId: 'dist' }));
    s.updateCircuit('chg', 1, { current: 'DC' });
    renderPower();
    const head = () => within(blockOf('dist')).getByTestId('ledger-block-head');
    expect(head()).toHaveTextContent('교류 입력: 소내전원반 차단기 4');
    expect(head()).toHaveTextContent('직류 입력: 충전기 차단기 1');
    expect(head()).toHaveTextContent('입력 전원: UPS 차단기 1');
    fireEvent.change(screen.getByRole('combobox', { name: '교류/직류' }), { target: { value: 'DC' } });
    expect(head()).toHaveTextContent('직류 입력: 충전기 차단기 1');
    expect(head()).not.toHaveTextContent('교류 입력');
    expect(head()).not.toHaveTextContent('UPS 차단기 1');
  });

  it('부하 · 포트 · 전원케이블 · 길이는 그 연결의 값', () => {
    renderPower();
    const r = rowOf('dist', 1);
    expect(cell(r, 'load')).toHaveTextContent('충전기');
    expect(cell(r, 'port')).toHaveTextContent('AC IN');
    expect(cell(r, 'cable')).toHaveTextContent('F-CV 2.5sq');
    expect(cell(r, 'length')).toHaveTextContent('12');
  });

  it('예비 차단기 행에는 「예비」와 「연결」 — 누르면 그 차단기 끝에서 연결 상자가 열린다', () => {
    renderPower();
    const load = cell(rowOf('dist', 3), 'load');
    expect(load).toHaveTextContent('예비');
    fireEvent.click(within(load).getByRole('button', { name: '연결' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('통신용 분전반 차단기 3');
  });

  it('부하 이름을 누르면 그 설비를 고른다(eq)', () => {
    renderPower();
    fireEvent.click(within(cell(rowOf('dist', 1), 'load')).getByRole('button', { name: '충전기' }));
    expect(screen.getByTestId('loc')).toHaveTextContent('eq=chg');
  });

  it('블록을 고른 뒤 다른 설비를 고르면 블록 초점(supply)은 놓는다', () => {
    renderPower('/n/S1?view=전원 계통&supply=dist&eq=dist');
    expect(blockOf('dist')).toHaveAttribute('aria-current', 'true');
    fireEvent.click(within(cell(rowOf('dist', 1), 'load')).getByRole('button', { name: '충전기' }));
    expect(screen.getByTestId('loc')).not.toHaveTextContent('supply=');
    expect(blockOf('dist')).not.toHaveAttribute('aria-current');
  });

  it('머리의 설비 이름을 누르면 그 설비를 고르고 블록에 초점(supply)', () => {
    renderPower();
    fireEvent.click(within(blockOf('dist')).getByRole('button', { name: '통신용 분전반' }));
    expect(screen.getByTestId('loc')).toHaveTextContent('supply=dist');
    expect(screen.getByTestId('loc')).toHaveTextContent('eq=dist');
    expect(blockOf('dist')).toHaveAttribute('aria-current', 'true');
  });

  it('교류/직류 거르기 — 행을 거르고 빈 블록은 숨긴다', () => {
    renderPower();
    fireEvent.change(screen.getByRole('combobox', { name: '교류/직류' }), { target: { value: 'DC' } });
    expect(blocks().map((b) => b.dataset.equipment)).toEqual(['dist']);
    expect(within(blockOf('dist')).getAllByTestId(/^ledger-row-/).map((r) => r.dataset.testid)).toEqual(['ledger-row-2']);
    fireEvent.change(screen.getByRole('combobox', { name: '교류/직류' }), { target: { value: 'AC' } });
    expect(blocks().map((b) => b.dataset.equipment)).toEqual(['panel', 'dist']);
    expect(within(blockOf('dist')).getAllByTestId(/^ledger-row-/)).toHaveLength(1);
  });

  it('검색 — 부하 이름으로 줄을 거르고, 없으면 「…에 해당하는 차단기가 없습니다」', () => {
    renderPower();
    const box = screen.getByRole('textbox', { name: '전원 계통 검색' });
    fireEvent.change(box, { target: { value: '충전기' } });
    expect(blocks().map((b) => b.dataset.equipment)).toEqual(['dist']);
    expect(within(blockOf('dist')).getAllByTestId(/^ledger-row-/)).toHaveLength(1);
    fireEvent.change(box, { target: { value: '없는것' } });
    expect(blocks()).toHaveLength(0);
    expect(screen.getByText("'없는것'에 해당하는 차단기가 없습니다")).toBeInTheDocument();
  });

  it('표기를 고치면 상세 패널 차단기 요약에도 같은 값(Review Focus 5)', () => {
    renderPower();
    fireEvent.click(within(cell(rowOf('dist', 3), 'label')).getByRole('button', { name: '표기 수정' }));
    const input = within(cell(rowOf('dist', 3), 'label')).getByRole('textbox');
    fireEvent.change(input, { target: { value: 'MCCB3' } });
    fireEvent.blur(input);
    expect(store.getState().overlays.circuits['circuit:dist:3']).toMatchObject({ label: 'MCCB3' });
    expect(cell(rowOf('dist', 3), 'label')).toHaveTextContent('MCCB3');
    expect(screen.getByText('3 · MCCB3')).toBeInTheDocument();
  });

  it('머리의 「차단기 추가」 — 행 하나가 늘고 실행 취소 한 번에 돌아간다', () => {
    renderPower();
    fireEvent.click(within(blockOf('dist')).getByRole('button', { name: '차단기 추가' }));
    expect(within(blockOf('dist')).getAllByTestId(/^ledger-row-/)).toHaveLength(4);
    expect(within(blockOf('dist')).getByTestId('ledger-block-head')).toHaveTextContent('차단기 4');
    act(() => store.temporal.getState().undo());
    expect(within(blockOf('dist')).getAllByTestId(/^ledger-row-/)).toHaveLength(3);
  });
});
