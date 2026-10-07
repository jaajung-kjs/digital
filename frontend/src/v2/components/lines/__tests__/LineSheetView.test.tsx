import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { coreKey } from '@twin/core';
import { workingCopyStore as store } from '../../../model/store/workingCopy';
import type { Equipment, FiberLine, Link } from '../../../model/types';
import { useWorkspaceRoute } from '../../../useWorkspaceRoute';
import { LineSheetView } from '../LineSheetView';

vi.mock('../../../model/hooks', () => ({
  useCatalog: () => ({ data: { categories: [], rackTypes: [], equipmentTypes: [], media: [],
    cableTypes: [{ id: 'opgw', key: 'a', name: 'OPGW', medium: 'fiber', sortOrder: 1 }, { id: 'fcv', key: 'b', name: 'F-CV', medium: 'power', sortOrder: 2 }] } }),
}));

const eq = (id: string, name: string): Equipment => ({
  id, substationId: 'S1', rackId: 'r', name, typeId: 't', status: 'normal', model: null, maker: null, madeOn: null, serial: null,
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

beforeEach(() => {
  store.getState().reset();
  /* 북춘천(S1)만 들렀다 — 춘천(S2)의 연결은 먼 연결(farLinks)·참조 설비로만 안다. */
  store.setState({
    saved: {
      ...store.getState().saved,
      substations: { S1: { id: 'S1', name: '북춘천S/S' } },
      refEquipment: [{ id: 'farLt', name: '춘천 광단말', substationId: 'S2' }],
      farLinks: [link('fk', 'S2', { kind: 'core', lineId: 'L1', no: 1, side: 'B' }, { kind: 'equipment', equipmentId: 'farLt', label: 'RX' })],
    },
  });
  const s = store.getState();
  s.create('racks', { id: 'r', substationId: 'S1', name: '랙', rackTypeId: 'rt', floorId: null, x: null, y: null, width: null, height: null, facing: null, updatedAt: '' });
  s.create('equipment', eq('ofd', 'OFD'));
  s.create('equipment', eq('ofd2', 'OFD#2'));
  s.create('equipment', eq('lt', '광단말 A'));
  s.create('fiberLines', line({ id: 'L1', name: '154kV 춘천-북춘천 T/L', lengthKm: 19.1, aEquipmentId: 'ofd', aPanel: 2, aStartNo: 25 }));
  /* 단자 미지정 끝 — 이 국이 B 끝. */
  s.create('fiberLines', line({ id: 'L2', coreCount: 2, aSubstationId: 'S2', bSubstationId: 'S1', aSubstationName: '춘천S/S', bSubstationName: '북춘천S/S' }));
  s.create('fiberLines', line({ id: 'L3', coreCount: 2, aEquipmentId: 'ofd2', aPanel: 1 }));
  s.create('links', link('k1', 'S1', { kind: 'core', lineId: 'L1', no: 1, side: 'A' }, { kind: 'equipment', equipmentId: 'lt', label: 'TX' }));
});

function Harness() {
  const route = useWorkspaceRoute();
  const loc = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <span data-testid="loc">{decodeURIComponent(loc.search)}</span>
      <button type="button" onClick={() => navigate(-1)}>뒤로</button>
      <button type="button" onClick={() => route.openBlock({ lineId: 'L1', side: 'A' })}>슬롯에서 블록 열기</button>
      {route.view === '선번장' && (
        <LineSheetView
          substationId="S1" selectedEquipmentId={route.eqId} onSelectEquipment={route.selectEquipment} focus={route.block} onFocus={route.focusBlock}
          onOpenEquipment={route.openEquipment}
        />
      )}
    </>
  );
}
const renderSheet = (path = '/n/S1?view=선번장') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/n/:nodeId" element={<Harness />} /></Routes>
  </MemoryRouter>,
);
const blocks = () => screen.getAllByTestId('sheet-block');
const blockOf = (lineId: string) => blocks().find((b) => b.dataset.line === lineId)!;
const rowOf = (lineId: string, no: number) => within(blockOf(lineId)).getByTestId(`sheet-row-${no}`);
const cell = (row: HTMLElement, col: string) => row.querySelector<HTMLElement>(`[data-col="${col}"]`)!;

describe('선번장', () => {
  it('블록 머리 — 단자 · 슬롯 · 어댑터 범위, 상대국, 선로명, 길이, 케이블 · 심수', () => {
    renderSheet();
    const head = within(blockOf('L1')).getByTestId('sheet-block-head');
    expect(head).toHaveTextContent('OFD · 슬롯 2 · 어댑터 25–28');
    expect(head).toHaveTextContent('↔ 춘천S/S');
    expect(head).toHaveTextContent('154kV 춘천-북춘천 T/L');
    expect(head).toHaveTextContent('19.1 km');
    expect(head).toHaveTextContent('OPGW 4심');
  });

  it('코어 3 행의 어댑터 = startNo + 2', () => {
    renderSheet();
    expect(cell(rowOf('L1', 3), 'jack')).toHaveTextContent('27');
  });

  it('자국 연결 — 이름이 보이고 누르면 그 설비를 고른다(eq)', () => {
    renderSheet();
    const near = cell(rowOf('L1', 1), 'near');
    fireEvent.click(within(near).getByRole('button', { name: '광단말 A TX' }));
    expect(screen.getByTestId('loc')).toHaveTextContent('eq=lt');
  });

  it('빈 자국 칸에는 호버 「잇기」 — 누르면 이 코어 끝에서 잇기 상자가 열린다', () => {
    renderSheet();
    fireEvent.click(within(cell(rowOf('L1', 2), 'near')).getByRole('button', { name: '연결' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('본 설비 단자: 154kV 춘천-북춘천 T/L 코어 2');
  });

  it('대국 연결 — 들르지 않은 국의 이름도 보이고, 칸에 단추가 없다(Review Focus 4)', () => {
    renderSheet();
    const far = cell(rowOf('L1', 1), 'far');
    expect(far).toHaveTextContent('춘천 광단말 RX');
    expect(within(far).queryByRole('button')).toBeNull();
    expect(within(cell(rowOf('L1', 2), 'far')).queryByRole('button')).toBeNull();
  });

  it('단자 미지정 블록은 맨 뒤에 선다(Review Focus 2)', () => {
    renderSheet();
    expect(blocks().map((b) => b.dataset.line)).toEqual(['L1', 'L3', 'L2']);
    expect(within(blockOf('L2')).getByTestId('sheet-block-head')).toHaveTextContent('단자 미지정');
  });

  it('상태를 고치면 updateCore 로 변경안에 실리고, 정상이 아니면 점 + 이름', () => {
    renderSheet();
    const st = cell(rowOf('L1', 2), 'status');
    fireEvent.click(within(st).getByRole('button', { name: '상태 수정' }));
    fireEvent.change(within(cell(rowOf('L1', 2), 'status')).getByRole('combobox'), { target: { value: 'broken' } });
    expect(store.getState().overlays.cores[coreKey('L1', 2)]).toMatchObject({ status: 'broken' });
    expect(cell(rowOf('L1', 2), 'status')).toHaveTextContent('단선');
  });

  it('용도는 그 블록 끝의 필드만 고친다 — B 끝 블록이면 bPurpose', () => {
    renderSheet();
    fireEvent.click(within(cell(rowOf('L2', 1), 'purpose')).getByRole('button', { name: '용도 수정' }));
    const input = within(cell(rowOf('L2', 1), 'purpose')).getByRole('textbox');
    fireEvent.change(input, { target: { value: '보호계전' } });
    fireEvent.blur(input);
    expect(store.getState().overlays.cores[coreKey('L2', 1)]).toEqual({ bPurpose: '보호계전' });
  });

  it('상대 끝 용도는 용도 칸의 참고(title)일 뿐이다', () => {
    store.getState().updateCore('L1', 4, { bPurpose: '춘천쪽 용도' });
    renderSheet();
    expect(cell(rowOf('L1', 4), 'purpose')).toHaveAttribute('title', '대국 측 용도: 춘천쪽 용도');
  });

  it('단자 Select 로 거른다 — 블록이 있는 단자만 선택지에 선다', () => {
    renderSheet();
    const pick = screen.getByRole('combobox', { name: '단자' }) as HTMLSelectElement;
    expect([...pick.options].map((o) => o.textContent)).toEqual(['전체', 'OFD', 'OFD#2', '단자 미지정']);
    fireEvent.change(pick, { target: { value: 'ofd2' } });
    expect(blocks().map((b) => b.dataset.line)).toEqual(['L3']);
  });

  it('연결 지우기 — 묻고 나서 지운다', async () => {
    renderSheet();
    fireEvent.click(within(cell(rowOf('L1', 1), 'near')).getByRole('button', { name: '연결 삭제' }));
    fireEvent.click(await screen.findByRole('button', { name: '삭제' }));
    await waitFor(() => expect(store.getState().overlays.links.creates.k1).toBeUndefined());
  });

  it('같은 국 안 광선로는 블록이 둘 — 용도는 그 블록 끝의 필드만 고친다(Review Focus 1)', () => {
    store.getState().create('fiberLines', line({ id: 'L4', coreCount: 2, bSubstationId: 'S1', bSubstationName: '북춘천S/S', aEquipmentId: 'ofd', aPanel: 3, bEquipmentId: 'ofd2', bPanel: 2 }));
    renderSheet();
    expect(blocks().filter((b) => b.dataset.line === 'L4').map((b) => b.dataset.side)).toEqual(['A', 'B']);
    const edit = (side: 'A' | 'B', value: string) => {
      const blk = blocks().find((b) => b.dataset.line === 'L4' && b.dataset.side === side)!;
      fireEvent.click(within(within(blk).getByTestId('sheet-row-1').querySelector<HTMLElement>('[data-col="purpose"]')!).getByRole('button', { name: '용도 수정' }));
      const input = within(blk).getByRole('textbox');
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
    };
    edit('A', 'A쪽');
    expect(store.getState().overlays.cores[coreKey('L4', 1)]).toEqual({ aPurpose: 'A쪽' });
    edit('B', 'B쪽');
    expect(store.getState().overlays.cores[coreKey('L4', 1)]).toEqual({ aPurpose: 'A쪽', bPurpose: 'B쪽' });
  });

  it('상대 국을 들렀으면 그 국 연결이 정답 — 먼 연결에 남은 옛 사본(같은 id)은 쓰지 않는다', () => {
    /* 들른 S2 의 연결 fk 는 코어 1 에 물려 있다. 먼 연결에는 같은 id 의 옛 사본이 코어 2 를 가리킨 채 남아 있다 —
       그 사본을 함께 넣으면 코어 2 대국 칸에 「춘천 광단말 OLD」가 선다. */
    const saved = store.getState().saved;
    const stale = link('fk', 'S2', { kind: 'core', lineId: 'L1', no: 2, side: 'B' }, { kind: 'equipment', equipmentId: 'farLt', label: 'OLD' });
    store.setState({ saved: { ...saved,
      substations: { ...saved.substations, S2: { id: 'S2', name: '춘천S/S' } },
      links: [saved.farLinks[0]!],
      farLinks: [stale],
    } });
    renderSheet();
    expect(cell(rowOf('L1', 1), 'far').textContent).toBe('춘천 광단말 RX');
    expect(cell(rowOf('L1', 2), 'far').textContent).toBe('—');
    expect(screen.queryByText(/OLD/)).toBeNull();
  });

  it('대국 끝이 남의 광선로 코어면 그 선로 이름으로 — 이름이 없으면 「A국–B국」, 모르면 「광선로」', () => {
    const saved = store.getState().saved;
    store.setState({ saved: { ...saved,
      refLines: [{ id: 'LX', name: null, aSubstationName: '춘천S/S', bSubstationName: '화천S/S' }],
      farLinks: [...saved.farLinks,
        link('fx', 'S2', { kind: 'core', lineId: 'L1', no: 2, side: 'B' }, { kind: 'core', lineId: 'LX', no: 22, side: 'A' }),
        link('fy', 'S2', { kind: 'core', lineId: 'L1', no: 3, side: 'B' }, { kind: 'core', lineId: 'LZ', no: 5, side: 'A' })],
    } });
    renderSheet();
    expect(cell(rowOf('L1', 2), 'far')).toHaveTextContent('춘천S/S–화천S/S 코어 22');
    expect(cell(rowOf('L1', 3), 'far')).toHaveTextContent('광선로 코어 5');
  });

  it('주소의 line·side 가 가리키는 블록이 초점(aria-current)', () => {
    renderSheet('/n/S1?view=선번장&line=L3&side=A');
    expect(blockOf('L3')).toHaveAttribute('aria-current', 'true');
    expect(blockOf('L1')).not.toHaveAttribute('aria-current');
  });

  it('상태 목록에는 「—」가 없다 — 상태는 비울 수 없다', () => {
    renderSheet();
    fireEvent.click(within(cell(rowOf('L1', 2), 'status')).getByRole('button', { name: '상태 수정' }));
    const pick = within(cell(rowOf('L1', 2), 'status')).getByRole('combobox') as HTMLSelectElement;
    expect([...pick.options].map((o) => o.textContent)).toEqual(['정상', '단선', '사용불가']);
  });

  it('검색은 비고도 본다', () => {
    store.getState().updateCore('L3', 2, { aNote: '라벨링 필요' });
    renderSheet();
    fireEvent.change(screen.getByRole('textbox', { name: '선번장 검색' }), { target: { value: '라벨링' } });
    expect(blocks().map((b) => b.dataset.line)).toEqual(['L3']);
    expect(within(blockOf('L3')).queryByTestId('sheet-row-1')).toBeNull();
    expect(within(blockOf('L3')).getByTestId('sheet-row-2')).toBeInTheDocument();
  });

  it('블록 머리의 단자 이름은 그 설비 상세(현황 · eq)로 가는 길이고, 뒤로 가면 보던 블록으로 돌아온다', () => {
    renderSheet('/n/S1?view=선번장&line=L1&side=A');
    const head = within(blockOf('L1')).getByTestId('sheet-block-head');
    expect(head).toHaveTextContent('OFD · 슬롯 2 · 어댑터 25–28');
    fireEvent.click(within(head).getByRole('button', { name: 'OFD' }));
    expect(screen.getByTestId('loc')).toHaveTextContent('view=현황&eq=ofd');
    expect(screen.getByTestId('loc')).not.toHaveTextContent('line=');
    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
    expect(screen.getByTestId('loc')).toHaveTextContent('view=선번장&line=L1&side=A');
  });

  it('슬롯 → 선번장(openBlock)은 기록을 남긴다 — 뒤로 가면 떠나 온 설비 상세로', () => {
    renderSheet('/n/S1?view=현황&eq=ofd');
    fireEvent.click(screen.getByRole('button', { name: '슬롯에서 블록 열기' }));
    expect(screen.getByTestId('loc')).toHaveTextContent('view=선번장&line=L1&side=A');
    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
    expect(screen.getByTestId('loc')).toHaveTextContent('view=현황&eq=ofd');
  });

  it('단자 미지정 블록의 머리에는 설비로 가는 길이 없다', () => {
    renderSheet();
    const head = within(blockOf('L2')).getByTestId('sheet-block-head');
    expect(within(head).queryByRole('button', { name: /상세 보기/ })).toBeNull();
    expect(within(head).getByRole('button', { name: '단자 미지정' })).toBeInTheDocument();
  });

  it('검색은 자국·대국 연결 이름도 본다 — 「춘천 광단말」로 그 국에 이어진 코어가 걸린다', () => {
    renderSheet();
    fireEvent.change(screen.getByRole('textbox', { name: '선번장 검색' }), { target: { value: '춘천 광단말' } });
    expect(blocks().map((b) => b.dataset.line)).toEqual(['L1']);
    expect(within(blockOf('L1')).getByTestId('sheet-row-1')).toBeInTheDocument();
    expect(within(blockOf('L1')).queryByTestId('sheet-row-2')).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: '선번장 검색' }), { target: { value: '광단말 A' } });
    expect(blocks().map((b) => b.dataset.line)).toEqual(['L1']);
  });

  it('검색에 걸린 것이 없으면 검색어를 되짚는다', () => {
    renderSheet();
    fireEvent.change(screen.getByRole('textbox', { name: '선번장 검색' }), { target: { value: '없는말' } });
    expect(screen.getByText("'없는말'에 해당하는 코어가 없습니다")).toBeInTheDocument();
  });

  it('빈 자국·대국 칸은 같은 「—」 — 자국 칸의 잇기는 따로 선다', () => {
    renderSheet();
    const near = cell(rowOf('L1', 2), 'near');
    const far = cell(rowOf('L1', 2), 'far');
    expect(far).toHaveTextContent(/^—$/);
    expect(near).toHaveTextContent('—');
    expect(within(near).getByRole('button', { name: '연결' })).toBeInTheDocument();
  });

  it('지우개·잇기는 이름 위에 겹치지 않고 제 자리, 호버 없는 기기에서도 보인다(HOVER_REVEAL)', () => {
    renderSheet();
    const trash = within(cell(rowOf('L1', 1), 'near')).getByRole('button', { name: '연결 삭제' });
    expect(trash.className).toContain('[@media(hover:none)]:opacity-100');
    expect(trash.className).not.toContain('absolute');
  });

  it('거리는 1550 이 없으면 1310 으로 물러서고 「(1310)」을 붙인다', () => {
    const m = { lineId: 'L1', side: 'A' as const, measuredBy: null, updatedAt: '', loss1310: null, loss1550: null };
    store.getState().create('coreMeasurements', { ...m, id: 'm1', coreNo: 1, measuredOn: '2025-01-01', dist1310: 12.5, dist1550: null });
    store.getState().create('coreMeasurements', { ...m, id: 'm2', coreNo: 2, measuredOn: '2025-01-01', dist1310: 12.5, dist1550: 12.6 });
    renderSheet();
    expect(cell(rowOf('L1', 1), 'dist')).toHaveTextContent('12.5(1310)');
    expect(cell(rowOf('L1', 2), 'dist')).toHaveTextContent(/^12\.6$/);
  });

  it('광선로가 없으면 빈 상태가 다음 할 일을 말한다', () => {
    store.getState().reset();
    renderSheet();
    expect(screen.getByText('이 변전소에 수용된 광선로가 없습니다')).toBeInTheDocument();
    expect(screen.getByText('「광선로 추가」로 상대국과 코어 수를 지정하세요')).toBeInTheDocument();
  });
});
