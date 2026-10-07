import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectiveRows } from '../../../model/store/effective';
import { workingCopyStore as store } from '../../../model/store/workingCopy';
import type { CoreMeasurement, Equipment, FiberLine } from '../../../model/types';
import { useWorkspaceRoute } from '../../../useWorkspaceRoute';
import { LineSheetView } from '../LineSheetView';
import { today } from '../measureDraft';

vi.mock('../../../model/hooks', () => ({
  useCatalog: () => ({ data: { categories: [], rackTypes: [], equipmentTypes: [], media: [],
    cableTypes: [{ id: 'opgw', key: 'a', name: 'OPGW', medium: 'fiber', sortOrder: 1 }] } }),
}));

const eq = (id: string, name: string): Equipment => ({
  id, substationId: 'S1', rackId: 'r', name, typeId: 't', status: 'normal', model: null, maker: null, madeOn: null, serial: null,
  installDate: null, manager: null, note: null, circuitCount: 0, panelCount: null, updatedAt: '',
});
const line = (over: Partial<FiberLine> & Pick<FiberLine, 'id'>): FiberLine => ({
  cableTypeId: 'opgw', coreCount: 6, name: null, lengthKm: null, segments: [],
  aSubstationId: 'S1', aEquipmentId: null, aPanel: null, aStartNo: 1,
  bSubstationId: 'S2', bEquipmentId: null, bPanel: null, bStartNo: 1,
  aSubstationName: '북춘천S/S', bSubstationName: '춘천S/S', updatedAt: '', ...over,
});
const meas = (id: string, over: Partial<CoreMeasurement>): CoreMeasurement => ({
  id, lineId: 'L1', coreNo: 5, side: 'A', measuredOn: null, loss1310: null, dist1310: null, loss1550: null, dist1550: null, measuredBy: null, updatedAt: '', ...over,
});

beforeEach(() => {
  store.getState().reset();
  store.setState({ saved: { ...store.getState().saved, substations: { S1: { id: 'S1', name: '북춘천S/S' } } } });
  const s = store.getState();
  s.create('racks', { id: 'r', substationId: 'S1', name: '랙', rackTypeId: 'rt', floorId: null, x: null, y: null, width: null, height: null, facing: null, updatedAt: '' });
  s.create('equipment', eq('ofd', 'OFD'));
  s.create('fiberLines', line({ id: 'L1', name: '154kV 춘천-북춘천 T/L', aEquipmentId: 'ofd', aPanel: 1, aStartNo: 1 }));
  s.create('coreMeasurements', meas('a-old', { measuredOn: '2024-01-10', loss1310: -10.5, measuredBy: '김' }));
  s.create('coreMeasurements', meas('a-new', { measuredOn: '2025-05-02', loss1310: -11.25, measuredBy: '이' }));
  s.create('coreMeasurements', meas('b-1', { side: 'B', measuredOn: '2025-06-01', loss1310: -9 }));
});

function Harness() {
  const route = useWorkspaceRoute();
  return <LineSheetView substationId="S1" selectedEquipmentId={route.eqId} onSelectEquipment={route.selectEquipment} focus={route.block} onFocus={route.focusBlock} />;
}
const renderSheet = () => render(
  <MemoryRouter initialEntries={['/n/S1?view=선번장']}>
    <Routes><Route path="/n/:nodeId" element={<Harness />} /></Routes>
  </MemoryRouter>,
);
const block = () => screen.getByTestId('sheet-block');
const row = (no: number) => within(block()).getByTestId(`sheet-row-${no}`);
const cell = (r: HTMLElement, col: string) => r.querySelector<HTMLElement>(`[data-col="${col}"]`)!;
const dialog = () => screen.getByRole('dialog');
const measurements = () => effectiveRows(store.getState(), 'coreMeasurements');

describe('코어 측정 이력', () => {
  const open = (no = 5) => fireEvent.click(within(row(no)).getByRole('button', { name: `코어 ${no} 측정 이력` }));

  it('제목은 코어 번호 — 선로 이름, 이쪽/상대 묶음이 side 로 갈리고 각각 최근 먼저', () => {
    renderSheet();
    open();
    expect(dialog()).toHaveTextContent('코어 5 — 154kV 춘천-북춘천 T/L');
    const near = screen.getByTestId('history-near');
    const far = screen.getByTestId('history-far');
    expect(near).toHaveTextContent('자국 측 · 북춘천S/S');
    expect(far).toHaveTextContent('대국 측 · 춘천S/S');
    expect(within(near).getAllByTestId('history-row').map((r) => r.textContent)).toEqual([
      expect.stringContaining('2025-05-02'), expect.stringContaining('2024-01-10'),
    ]);
    /* 손실은 음수 그대로. */
    expect(within(near).getAllByTestId('history-row')[0]).toHaveTextContent('-11.25');
    expect(within(far).getAllByTestId('history-row')).toHaveLength(1);
    expect(within(far).getByTestId('history-row')).toHaveTextContent('2025-06-01');
  });

  it('지우기 — 물어보고, 지우면 그 줄이 사라지고 선번장의 최근 측정도 따라온다', async () => {
    renderSheet();
    open();
    const near = screen.getByTestId('history-near');
    fireEvent.click(within(within(near).getAllByTestId('history-row')[0]!).getByRole('button', { name: '측정 삭제' }));
    const ask = await screen.findByRole('alertdialog');
    fireEvent.click(within(ask).getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(within(screen.getByTestId('history-near')).getAllByTestId('history-row')).toHaveLength(1));
    expect(measurements().some((m) => m.id === 'a-new')).toBe(false);
    expect(cell(row(5), 'measuredOn')).toHaveTextContent('2024-01-10');
  });

  it('측정 추가 — 이쪽 끝 한 줄, 음수 손실 그대로, 넣으면 맨 위에 선다', () => {
    renderSheet();
    open();
    const add = screen.getByRole('region', { name: '측정 추가' });
    fireEvent.change(within(add).getByRole('textbox', { name: '측정일' }), { target: { value: '2026-02-03' } });
    fireEvent.change(within(add).getByRole('textbox', { name: '1310 nm 손실' }), { target: { value: '-12.4' } });
    fireEvent.click(within(add).getByRole('button', { name: '추가' }));
    const created = measurements().find((m) => m.measuredOn === '2026-02-03')!;
    expect(created).toMatchObject({ lineId: 'L1', coreNo: 5, side: 'A', loss1310: -12.4, dist1310: null });
    expect(within(screen.getByTestId('history-near')).getAllByTestId('history-row')[0]).toHaveTextContent('2026-02-03');
  });

  it('측정 추가 — 수가 아니면 붉고 「숫자만 넣으세요」, 추가가 잠긴다', () => {
    renderSheet();
    open();
    const add = screen.getByRole('region', { name: '측정 추가' });
    const box = within(add).getByRole('textbox', { name: '1550 nm 손실' });
    fireEvent.change(box, { target: { value: 'abc' } });
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(add).toHaveTextContent('숫자만 입력하세요');
    expect(within(add).getByRole('button', { name: '추가' })).toBeDisabled();
  });
});

describe('블록 일괄 측정 입력', () => {
  const open = () => fireEvent.click(within(block()).getByRole('button', { name: '측정 입력' }));
  const box = (no: number, name: string) => within(dialog()).getByRole('textbox', { name: `코어 ${no} ${name}` });

  it('측정일은 오늘이 기본, 줄은 코어 1..N', () => {
    renderSheet();
    open();
    expect(within(dialog()).getByRole('textbox', { name: '측정일' })).toHaveValue(today());
    expect(within(dialog()).getAllByTestId(/^measure-row-/)).toHaveLength(6);
  });

  it('3 줄만 채우면 측정 3 건(빈 줄 0) — 블록 끝·측정일·측정자, 되돌리기 한 번에 함께 물러난다(Review Focus 5)', () => {
    renderSheet();
    open();
    fireEvent.change(within(dialog()).getByRole('textbox', { name: '측정일' }), { target: { value: '2026-10-01' } });
    fireEvent.change(within(dialog()).getByRole('textbox', { name: '측정자' }), { target: { value: '박' } });
    fireEvent.change(box(1, '1310 nm 손실'), { target: { value: '-13.05' } });
    fireEvent.change(box(2, '1550 nm 거리'), { target: { value: '19.2' } });
    fireEvent.change(box(4, '1550 nm 손실'), { target: { value: '-8' } });
    /* 썼다 지운 줄도 빈 줄이다. */
    fireEvent.change(box(3, '1310 nm 거리'), { target: { value: '1' } });
    fireEvent.change(box(3, '1310 nm 거리'), { target: { value: '' } });
    const before = measurements().length;
    fireEvent.click(within(dialog()).getByRole('button', { name: '등록' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const added = measurements().filter((m) => m.measuredOn === '2026-10-01');
    expect(added).toHaveLength(3);
    expect(measurements()).toHaveLength(before + 3);
    expect(added.map((m) => m.coreNo).sort()).toEqual([1, 2, 4]);
    expect(added.find((m) => m.coreNo === 1)).toMatchObject({ side: 'A', loss1310: -13.05, dist1310: null, measuredBy: '박', lineId: 'L1' });
    expect(added.find((m) => m.coreNo === 2)).toMatchObject({ dist1550: 19.2, loss1310: null });
    /* 넣은 뒤 바로 블록의 최근 측정 칸이 새 값이다. */
    expect(cell(row(1), 'measuredOn')).toHaveTextContent('2026-10-01');
    expect(cell(row(1), 'loss1310')).toHaveTextContent('-13.05');
    store.temporal.getState().undo();
    expect(measurements()).toHaveLength(before);
  });

  it('같은 날 다시 잰 값을 넣어도 최근 측정 칸이 새 값이다', () => {
    renderSheet();
    open();
    fireEvent.change(within(dialog()).getByRole('textbox', { name: '측정일' }), { target: { value: '2025-05-02' } });
    fireEvent.change(box(5, '1310 nm 손실'), { target: { value: '-7.5' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: '등록' }));
    expect(cell(row(5), 'loss1310')).toHaveTextContent('-7.5');
  });

  it('abc 를 넣으면 그 칸이 붉고 「숫자만 넣으세요」, 넣기가 잠긴다', () => {
    renderSheet();
    open();
    fireEvent.change(box(1, '1310 nm 손실'), { target: { value: '-3' } });
    fireEvent.change(box(2, '1310 nm 손실'), { target: { value: 'abc' } });
    expect(box(2, '1310 nm 손실')).toHaveAttribute('aria-invalid', 'true');
    expect(box(1, '1310 nm 손실')).not.toHaveAttribute('aria-invalid');
    expect(dialog()).toHaveTextContent('숫자만 입력하세요 — 코어 2');
    expect(within(dialog()).getByRole('button', { name: '등록' })).toBeDisabled();
  });

  it('제목은 블록에서 — 단자 · 슬롯 · 어댑터 ↔ 상대국', () => {
    renderSheet();
    open();
    expect(within(dialog()).getByRole('heading', { level: 2 })).toHaveTextContent('측정 입력 — OFD · 슬롯 1 · 어댑터 1–6 ↔ 춘천S/S');
  });

  it('고칠 칸이 있으면 바닥 글이 줄 수 대신 「고칠 칸이 있습니다」, 1e3·0x10 같은 꼴도 수가 아니다', () => {
    renderSheet();
    open();
    fireEvent.change(box(1, '1310 nm 손실'), { target: { value: '-3' } });
    expect(dialog()).toHaveTextContent('1건을 등록합니다');
    fireEvent.change(box(2, '1310 nm 손실'), { target: { value: '1e3' } });
    expect(box(2, '1310 nm 손실')).toHaveAttribute('aria-invalid', 'true');
    expect(dialog()).toHaveTextContent('입력 오류가 있습니다');
    expect(dialog()).not.toHaveTextContent('건을 등록합니다');
    fireEvent.change(box(2, '1310 nm 손실'), { target: { value: '+.5' } });
    expect(box(2, '1310 nm 손실')).not.toHaveAttribute('aria-invalid');
  });

  it('친 줄이 있으면 닫기 전에 묻는다 — 물리면 남고, 버리면 아무것도 만들지 않고 닫힌다', async () => {
    renderSheet();
    open();
    const before = measurements().length;
    fireEvent.change(box(1, '1310 nm 손실'), { target: { value: '-3' } });
    fireEvent.change(box(2, '1310 nm 손실'), { target: { value: '-4' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: '취소' }));
    let ask = await screen.findByRole('alertdialog');
    expect(ask).toHaveTextContent('입력한 2건을 취소하시겠습니까?');
    fireEvent.click(within(ask).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(box(1, '1310 nm 손실')).toHaveValue('-3');
    fireEvent.keyDown(window, { key: 'Escape' });
    ask = await screen.findByRole('alertdialog');
    fireEvent.click(within(ask).getByRole('button', { name: '입력 취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(measurements()).toHaveLength(before);
  });

  it('빈 채로는 묻지 않고 닫힌다', () => {
    renderSheet();
    open();
    fireEvent.click(within(dialog()).getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('다 빈 표·빈 측정일이면 넣기가 잠긴다', () => {
    renderSheet();
    open();
    expect(within(dialog()).getByRole('button', { name: '등록' })).toBeDisabled();
    fireEvent.change(box(1, '1310 nm 손실'), { target: { value: '-3' } });
    expect(within(dialog()).getByRole('button', { name: '등록' })).toBeEnabled();
    fireEvent.change(within(dialog()).getByRole('textbox', { name: '측정일' }), { target: { value: '' } });
    expect(within(dialog()).getByRole('button', { name: '등록' })).toBeDisabled();
  });

  it('Enter 는 아래 칸으로, 한글 조합 중의 Enter 는 옮기지 않는다', () => {
    renderSheet();
    open();
    const a = box(1, '1550 nm 손실');
    a.focus();
    fireEvent.keyDown(a, { key: 'Enter', isComposing: true });
    expect(document.activeElement).toBe(a);
    fireEvent.keyDown(a, { key: 'Enter' });
    expect(document.activeElement).toBe(box(2, '1550 nm 손실'));
    fireEvent.keyDown(document.activeElement!, { key: 'Enter', shiftKey: true });
    expect(document.activeElement).toBe(a);
  });
});
