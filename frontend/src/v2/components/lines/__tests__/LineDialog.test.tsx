import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectiveCores, effectiveRows } from '../../../model/store/effective';
import { workingCopyStore as store } from '../../../model/store/workingCopy';
import type { Equipment, FiberLine, Link } from '../../../model/types';
import { useWorkspaceRoute } from '../../../useWorkspaceRoute';
import { LineSheetView } from '../LineSheetView';

vi.mock('../../../model/hooks', () => ({
  useCatalog: () => ({ data: { categories: [], rackTypes: [], equipmentTypes: [], media: [],
    cableTypes: [{ id: 'opgw', key: 'a', name: 'OPGW', medium: 'fiber', sortOrder: 1 }, { id: 'fcv', key: 'b', name: 'F-CV', medium: 'power', sortOrder: 2 }] } }),
}));
vi.mock('../../../hooks', () => ({
  useV2OrgTree: () => ({ data: { headquarters: [{ id: 'hq', name: '강원본부', sortOrder: 1, branches: [
    { id: 'br', name: '직할', sortOrder: 1, headquartersId: 'hq', substations: [
      { id: 'S1', name: '북춘천S/S', sortOrder: 1, branchId: 'br', floors: [] },
      { id: 'S2', name: '춘천S/S', sortOrder: 2, branchId: 'br', floors: [] },
      { id: 'S3', name: '화천S/S', sortOrder: 3, branchId: 'br', floors: [] },
    ] },
  ] }] } }),
}));

const eq = (id: string, name: string, substationId = 'S1'): Equipment => ({
  id, substationId, rackId: substationId === 'S1' ? 'r' : 'r2', name, typeId: 't', status: 'normal', model: null, maker: null, madeOn: null, serial: null,
  installDate: null, manager: null, note: null, circuitCount: 0, panelCount: null, updatedAt: '',
});
const line = (over: Partial<FiberLine> & Pick<FiberLine, 'id'>): FiberLine => ({
  cableTypeId: 'opgw', coreCount: 4, name: null, lengthKm: null, segments: [],
  aSubstationId: 'S1', aEquipmentId: null, aPanel: null, aStartNo: 1,
  bSubstationId: 'S2', bEquipmentId: null, bPanel: null, bStartNo: 1,
  aSubstationName: '북춘천S/S', bSubstationName: '춘천S/S', updatedAt: '', ...over,
});
const link = (id: string, substationId: string, a: Link['a'], b: Link['b']): Link => ({
  id, substationId, cableTypeId: null, lengthM: null, spec: null, note: null, pathPoints: [], a, b, updatedAt: '',
});
const rack = (id: string, substationId: string) => ({ id, substationId, name: id, rackTypeId: 'rt', floorId: null, x: null, y: null, width: null, height: null, facing: null, updatedAt: '' });

const realEnsure = store.getState().ensureLoaded;

beforeEach(() => {
  store.getState().reset();
  store.setState({ ensureLoaded: realEnsure });
  /* 북춘천(S1)·춘천(S2)을 들렀다 — 춘천 설비 목록이 곧바로 선다. 화천(S3)은 아직. */
  store.setState({
    loaded: ['S1', 'S2'],
    saved: {
      ...store.getState().saved,
      substations: { S1: { id: 'S1', name: '북춘천S/S' }, S2: { id: 'S2', name: '춘천S/S' } },
    },
  });
  const s = store.getState();
  s.create('racks', rack('r', 'S1'));
  s.create('racks', rack('r2', 'S2'));
  s.create('equipment', eq('ofd', 'OFD'));
  s.create('equipment', eq('lt', '광단말 A'));
  s.create('equipment', eq('cofd', '춘천 OFD', 'S2'));
  s.create('fiberLines', line({ id: 'L1', name: '154kV 춘천-북춘천 T/L', lengthKm: 19.1, aEquipmentId: 'ofd', aPanel: 2, aStartNo: 25 }));
  /* 이 국이 B 끝인 광선로. */
  s.create('fiberLines', line({ id: 'L2', coreCount: 2, aSubstationId: 'S2', bSubstationId: 'S1', aSubstationName: '춘천S/S', bSubstationName: '북춘천S/S', aEquipmentId: 'cofd', aPanel: 1 }));
  s.create('links', link('k1', 'S1', { kind: 'core', lineId: 'L1', no: 1, side: 'A' }, { kind: 'equipment', equipmentId: 'lt', label: 'TX' }));
});

function Harness() {
  const route = useWorkspaceRoute();
  const loc = useLocation();
  return (
    <>
      <span data-testid="loc">{decodeURIComponent(loc.search)}</span>
      <LineSheetView substationId="S1" selectedEquipmentId={route.eqId} onSelectEquipment={route.selectEquipment} focus={route.block} onFocus={route.focusBlock} />
    </>
  );
}
const renderSheet = () => render(
  <MemoryRouter initialEntries={['/n/S1?view=선번장']}>
    <Routes><Route path="/n/:nodeId" element={<Harness />} /></Routes>
  </MemoryRouter>,
);
const blocks = () => screen.getAllByTestId('sheet-block');
const blockOf = (lineId: string, side?: 'A' | 'B') => blocks().find((b) => b.dataset.line === lineId && (!side || b.dataset.side === side))!;
const lines = () => effectiveRows(store.getState(), 'fiberLines');
const dialog = () => screen.getByRole('dialog');
const field = (name: string) => within(dialog()).getByLabelText(name) as HTMLInputElement | HTMLSelectElement;
const set = (name: string, value: string) => fireEvent.change(field(name), { target: { value } });
const openEdit = (lineId: string, side?: 'A' | 'B') => fireEvent.click(within(blockOf(lineId, side)).getByRole('button', { name: '편집' }));

describe('광선로 추가', () => {
  it('상대국·케이블 품목·코어 수가 없으면 추가 단추가 잠기고, 채워 추가하면 새 블록이 선다(이 국이 A 끝)', async () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: '광선로 추가' }));
    const add = () => within(dialog()).getByRole('button', { name: '추가' });
    expect(add()).toBeDisabled();
    /* 케이블 품목은 광선로 매체만. */
    expect(within(field('케이블 품목')).queryByRole('option', { name: 'F-CV' })).toBeNull();

    fireEvent.click(within(dialog()).getByRole('button', { name: /^춘천S\/S/ }));
    expect(add()).toBeDisabled();
    set('케이블 품목', 'opgw');
    expect(add()).toBeDisabled();
    set('코어 수', '0');
    expect(add()).toBeDisabled();
    set('코어 수', '12');
    set('선로명', '새 선로');
    set('긍장', '3.5');
    set('자국 접속 설비', 'ofd');
    set('자국 슬롯', '4');
    set('대국 접속 설비', 'cofd');
    expect(add()).toBeEnabled();
    fireEvent.click(add());

    expect(screen.queryByRole('dialog')).toBeNull();
    const created = lines().find((l) => l.name === '새 선로')!;
    expect(created).toMatchObject({
      cableTypeId: 'opgw', coreCount: 12, lengthKm: 3.5,
      aSubstationId: 'S1', aEquipmentId: 'ofd', aPanel: 4, aStartNo: 1, aSubstationName: '북춘천S/S',
      bSubstationId: 'S2', bEquipmentId: 'cofd', bPanel: null, bStartNo: 1, bSubstationName: '춘천S/S',
    });
    const b = blockOf(created.id, 'A');
    expect(within(b).getByTestId('sheet-block-head')).toHaveTextContent('OFD · 슬롯 4 · 어댑터 1–12');
    expect(within(b).getAllByTestId(/^sheet-row-/)).toHaveLength(12);
    /* 닫으면 그 블록으로 — 주소가 쥔다. */
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent(`line=${created.id}&side=A`));
    expect(b).toHaveAttribute('aria-current', 'true');
  });

  it('이 국을 상대국으로 고르면 「같은 국 안」 — 추가하면 블록이 둘(A·B)', () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: '광선로 추가' }));
    const self = within(dialog()).getByRole('button', { name: /^북춘천S\/S/ });
    expect(self).toHaveTextContent('동일 변전소 내');
    fireEvent.click(self);
    set('케이블 품목', 'opgw');
    set('코어 수', '2');
    set('선로명', '국 안 선로');
    fireEvent.click(within(dialog()).getByRole('button', { name: '추가' }));
    const created = lines().find((l) => l.name === '국 안 선로')!;
    expect(created.aSubstationId).toBe('S1');
    expect(created.bSubstationId).toBe('S1');
    expect(blocks().filter((b) => b.dataset.line === created.id).map((b) => b.dataset.side).sort()).toEqual(['A', 'B']);
  });

  it('상대국을 바꾸면 상대 끝 칸이 비워진다 — 앞 국의 단자 설비가 남지 않는다', () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: '광선로 추가' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: /^춘천S\/S/ }));
    set('대국 접속 설비', 'cofd');
    set('대국 시작번호', '7');
    expect(field('대국 접속 설비')).toHaveValue('cofd');
    fireEvent.click(within(dialog()).getByRole('button', { name: /^북춘천S\/S/ }));
    expect(field('대국 접속 설비')).toHaveValue('');
    expect(within(field('대국 접속 설비')).queryByRole('option', { name: '춘천 OFD' })).toBeNull();
    expect(field('대국 시작번호')).toHaveValue('1');
    set('케이블 품목', 'opgw');
    set('코어 수', '2');
    set('선로명', '바꾼 선로');
    fireEvent.click(within(dialog()).getByRole('button', { name: '추가' }));
    expect(lines().find((l) => l.name === '바꾼 선로')).toMatchObject({ bSubstationId: 'S1', bEquipmentId: null });
  });

  it('상대국 목록은 「본부 · 지사」로 어디의 국인지 적는다', () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: '광선로 추가' }));
    expect(within(dialog()).getByRole('button', { name: /^춘천S\/S/ })).toHaveTextContent('강원본부 · 직할');
  });

  it('들르지 않은 상대국을 고르면 그 국을 불러오고, 불러오는 중은 그 칸에 말한다', () => {
    const ensure = vi.fn(async () => {});
    store.setState({ ensureLoaded: ensure, loading: 'S3' });
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: '광선로 추가' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: /^화천S\/S/ }));
    expect(ensure).toHaveBeenCalledWith('S3');
    expect(field('대국 접속 설비')).toBeDisabled();
    expect(within(field('대국 접속 설비')).getByRole('option', { name: '불러오는 중…' })).toBeInTheDocument();
    /* 비워 둬도 추가할 수 있다. */
    set('케이블 품목', 'opgw');
    set('코어 수', '6');
    expect(within(dialog()).getByRole('button', { name: '추가' })).toBeEnabled();
  });

  it('상대국을 못 불러왔으면 그 칸에 까닭을 적는다', () => {
    store.setState({ ensureLoaded: vi.fn(async () => {}), loadErrors: { S3: '변전소를 불러오지 못했습니다' } });
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: '광선로 추가' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: /^화천S\/S/ }));
    expect(within(dialog()).getByText('변전소를 불러오지 못했습니다')).toBeInTheDocument();
  });
});

describe('광선로 편집', () => {
  it('값이 채워져 열리고, 슬롯·시작번호를 바꾸면 어댑터 범위가 바뀐다', () => {
    renderSheet();
    openEdit('L1');
    expect(field('코어 수')).toHaveValue('4');
    expect(field('선로명')).toHaveValue('154kV 춘천-북춘천 T/L');
    expect(field('자국 접속 설비')).toHaveValue('ofd');
    expect(field('자국 슬롯')).toHaveValue('2');
    expect(field('자국 시작번호')).toHaveValue('25');
    /* 끝의 국은 만든 뒤 바꾸지 않는다 — 고르는 목록이 없고 그 까닭을 적는다. */
    expect(within(dialog()).queryByRole('button', { name: /^화천S\/S/ })).toBeNull();
    expect(within(dialog()).getByText('상대국은 변경할 수 없습니다 — 변경하려면 삭제 후 다시 추가하세요')).toBeInTheDocument();
    set('자국 슬롯', '3');
    set('자국 시작번호', '13');
    fireEvent.click(within(dialog()).getByRole('button', { name: '확인' }));
    expect(within(blockOf('L1')).getByTestId('sheet-block-head')).toHaveTextContent('OFD · 슬롯 3 · 어댑터 13–16');
    expect(lines().find((l) => l.id === 'L1')).toMatchObject({ aPanel: 3, aStartNo: 13 });
  });

  it('이 국이 B 끝인 블록은 이쪽 = B 로 보이고 B 로 되돌려 저장한다', () => {
    renderSheet();
    openEdit('L2');
    expect(field('자국 접속 설비')).toHaveValue('');
    expect(field('대국 접속 설비')).toHaveValue('cofd');
    expect(field('대국 슬롯')).toHaveValue('1');
    set('자국 접속 설비', 'ofd');
    set('자국 슬롯', '5');
    fireEvent.click(within(dialog()).getByRole('button', { name: '확인' }));
    expect(lines().find((l) => l.id === 'L2')).toMatchObject({ bEquipmentId: 'ofd', bPanel: 5, aEquipmentId: 'cofd', aPanel: 1 });
  });

  it('코어 수를 줄일 때 잘릴 코어에 연결·측정이 있으면 까닭을 말하고 아무것도 바꾸지 않는다', () => {
    const s = store.getState();
    s.create('links', link('k3', 'S1', { kind: 'core', lineId: 'L1', no: 3, side: 'A' }, { kind: 'equipment', equipmentId: 'lt', label: 'RX' }));
    s.create('coreMeasurements', { id: 'm4', lineId: 'L1', coreNo: 4, measuredOn: '2026-01-01', side: 'A', loss1310: 1, dist1310: null, loss1550: null, dist1550: null, measuredBy: null, updatedAt: '' });
    renderSheet();
    openEdit('L1');
    const before = store.getState().overlays;
    /* 막는 말은 막힌 순간에 — 치는 동안은 말하지 않고 확인은 눌린다. */
    set('코어 수', '2');
    expect(within(dialog()).queryByText(/줄일 수 없습니다/)).toBeNull();
    const ok = within(dialog()).getByRole('button', { name: '확인' });
    expect(ok).toBeEnabled();
    fireEvent.click(ok);
    /* 상자는 그대로, 까닭은 코어 수 칸에. */
    expect(within(dialog()).getByText('코어 3, 4에 연결·측정이 있어 코어 수를 줄일 수 없습니다')).toBeInTheDocument();
    expect(field('코어 수')).toHaveAttribute('aria-invalid', 'true');
    expect(store.getState().overlays).toBe(before);
    /* 코어 수를 고치면 까닭이 걷힌다. */
    set('코어 수', '3');
    expect(within(dialog()).queryByText(/줄일 수 없습니다/)).toBeNull();
    fireEvent.click(within(dialog()).getByRole('button', { name: '확인' }));
    expect(within(dialog()).getByText('코어 4에 연결·측정이 있어 코어 수를 줄일 수 없습니다')).toBeInTheDocument();
    expect(store.getState().overlays).toBe(before);
    expect(lines().find((l) => l.id === 'L1')!.coreCount).toBe(4);
    expect(within(blockOf('L1')).getAllByTestId(/^sheet-row-/)).toHaveLength(4);
  });

  it('막는 코어는 이어진 것끼리 묶어 적는다 — 사이가 빈 코어는 범위에 넣지 않는다', () => {
    const s = store.getState();
    s.create('links', link('k3', 'S1', { kind: 'core', lineId: 'L1', no: 3, side: 'A' }, { kind: 'equipment', equipmentId: 'lt', label: 'RX' }));
    s.create('coreMeasurements', { id: 'm5', lineId: 'L1', coreNo: 5, measuredOn: null, side: 'A', loss1310: 1, dist1310: null, loss1550: null, dist1550: null, measuredBy: null, updatedAt: '' });
    s.update('fiberLines', 'L1', { coreCount: 6 });
    renderSheet();
    openEdit('L1');
    set('코어 수', '2');
    fireEvent.click(within(dialog()).getByRole('button', { name: '확인' }));
    expect(within(dialog()).getByText('코어 3, 5에 연결·측정이 있어 코어 수를 줄일 수 없습니다')).toBeInTheDocument();
  });

  it('쓰지 않는 코어는 줄일 수 있다 — 잘린 코어에 고쳐 두던 값도 함께 걷는다', () => {
    store.getState().updateCore('L1', 4, { aPurpose: '예비' });
    renderSheet();
    openEdit('L1');
    set('코어 수', '3');
    fireEvent.click(within(dialog()).getByRole('button', { name: '확인' }));
    expect(within(blockOf('L1')).getAllByTestId(/^sheet-row-/)).toHaveLength(3);
    expect(Object.keys(store.getState().overlays.cores)).toEqual([]);
    expect(effectiveCores(store.getState(), 'L1')).toHaveLength(3);
  });
});

describe('광선로 지우기', () => {
  it('확인 문구에 함께 지워질 코어·측정·연결 수, 확인하면 블록이 사라진다', async () => {
    store.getState().create('coreMeasurements', { id: 'm1', lineId: 'L1', coreNo: 1, measuredOn: null, side: 'A', loss1310: 1, dist1310: null, loss1550: null, dist1550: null, measuredBy: null, updatedAt: '' });
    renderSheet();
    openEdit('L1');
    fireEvent.click(within(dialog()).getByRole('button', { name: '광선로 삭제' }));
    const ask = await screen.findByRole('alertdialog');
    expect(ask).toHaveTextContent('코어 4 · 측정 1 · 연결 1');
    fireEvent.click(within(ask).getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(blocks().some((b) => b.dataset.line === 'L1')).toBe(false);
    expect(effectiveRows(store.getState(), 'links').some((l) => l.id === 'k1')).toBe(false);
  });

  it('물리면 그대로다', async () => {
    renderSheet();
    openEdit('L1');
    fireEvent.click(within(dialog()).getByRole('button', { name: '광선로 삭제' }));
    const ask = await screen.findByRole('alertdialog');
    fireEvent.click(within(ask).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(blocks().some((b) => b.dataset.line === 'L1')).toBe(true);
  });
});
