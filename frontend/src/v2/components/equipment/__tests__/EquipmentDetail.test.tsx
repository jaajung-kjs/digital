import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCommitPayload } from '../../../model/store/commitPayload';
import { workingCopyStore as store } from '../../../model/store/workingCopy';
import { EquipmentDetail } from '../EquipmentDetail';
import { RackDetail } from '../RackDetail';

vi.mock('../../../model/hooks', () => ({
  useCatalog: () => ({ data: { categories: [], rackTypes: [], equipmentTypes: [], media: [], cableTypes: [{ id: 'fcv', key: 'a', name: 'F-CV', medium: 'power', sortOrder: 1 }] } }),
}));

const eqBase = { substationId: 'S1', rackId: 'r1', typeId: 'et', status: 'normal', model: null, maker: null, madeOn: null, serial: null, installDate: null, manager: null, note: null, panelCount: null, updatedAt: '' };

beforeEach(() => {
  store.getState().reset();
  const s = store.getState();
  s.create('racks', { id: 'r1', substationId: 'S1', name: '분전반함', rackTypeId: 'rt', floorId: null, x: null, y: null, width: null, height: null, facing: null, updatedAt: '' });
  s.create('equipment', { ...eqBase, id: 'p', name: '분전반 P1', circuitCount: 2 });
  s.create('equipment', { ...eqBase, id: 'l', name: '부하', circuitCount: 0 });
  s.create('links', { id: 'k', substationId: 'S1', cableTypeId: null, lengthM: null, spec: null, note: null, pathPoints: [], a: { kind: 'circuit', equipmentId: 'p', no: 2 }, b: { kind: 'equipment', equipmentId: 'l' }, updatedAt: '' });
});

const openEditor = () => fireEvent.click(screen.getByRole('button', { name: '편집' }));
const breakerCard = () => screen.getByText(/^차단기 \d+$/).closest('[data-detail-head]')!.parentElement!;
/* 요약 줄 — 카드 머리의 편집·추가를 뺀 누를 수 있는 줄. */
const breakerRows = () => within(breakerCard()).getAllByRole('button').filter((b) => !['편집', '추가'].includes(b.textContent ?? ''));

describe('설비 상세 — 차단기', () => {
  it('차단기가 없는 설비에는 차단기 카드가 없고, ⋯ › 차단기 추가 로 한 줄이 생기며 편집 창이 그 줄로 열린다', () => {
    render(<EquipmentDetail equipmentId="l" onClose={vi.fn()} onDeleted={vi.fn()} />);
    expect(screen.queryByText(/^차단기 \d+$/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '차단기 추가' }));
    expect(store.getState().overlays.equipment.creates.l!.circuitCount).toBe(1);
    expect(screen.getByText('차단기 1')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByTestId('circuit-no').map((e) => e.textContent)).toEqual(['1']);
  });

  it('카드의 추가는 차단기 수를 하나 늘리고 편집 창을 새 줄로 연다 — 개수 입력 칸은 없다', () => {
    render(<EquipmentDetail equipmentId="p" onClose={vi.fn()} onDeleted={vi.fn()} />);
    expect(screen.queryByLabelText(/차단기 수|회로 수/)).toBeNull();
    fireEvent.click(within(breakerCard()).getByRole('button', { name: '추가' }));
    expect(store.getState().overlays.equipment.creates.p!.circuitCount).toBe(3);
    expect(screen.getByText('차단기 3')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByTestId('circuit-row-3')).toHaveAttribute('aria-current', 'true');
  });

  it('요약 줄은 한 줄 — 번호 · 표기 · 용량 · 갈래 · 개폐 → 부하, 빈 칸은 건너뛰고 「회로」라 쓰지 않는다', () => {
    store.getState().updateCircuit('p', 2, { label: 'F2', capacity: '30A', current: 'AC', switch: 'on' });
    render(<EquipmentDetail equipmentId="p" onClose={vi.fn()} onDeleted={vi.fn()} />);
    const rows = breakerRows();
    expect(rows.map((r) => r.textContent)).toEqual(['1', '2 · F2 · 30A · 교류 · 투입 → 부하']);
    expect(rows[1]).toHaveClass('truncate');
    expect(breakerCard()).not.toHaveTextContent('회로');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('요약 줄을 누르면 편집 창이 그 줄로 열린다 — 열은 번호 · 표기 · 갈래 · 전압 · 용량 · 상 · 개폐 · 용도 · 연결(부하)', () => {
    render(<EquipmentDetail equipmentId="p" onClose={vi.fn()} onDeleted={vi.fn()} />);
    fireEvent.click(breakerRows()[1]!);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['번호', '표기', '갈래', '전압', '용량', '상', '개폐', '용도', '연결(부하)']);
    expect(within(dialog).getByTestId('circuit-row-2')).toHaveAttribute('aria-current', 'true');
    expect(within(dialog).getByTestId('circuit-row-1')).not.toHaveAttribute('aria-current');
  });

  it('편집 창에서 표기를 고치면 오버레이에 실린다', () => {
    render(<EquipmentDetail equipmentId="p" onClose={vi.fn()} onDeleted={vi.fn()} />);
    openEditor();
    fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: '표기 고치기' })[0]!);
    const input = screen.getByRole('textbox', { name: '표기' });
    fireEvent.change(input, { target: { value: 'F1' } });
    fireEvent.blur(input);
    expect(store.getState().overlays.circuits['circuit:p:1']?.label).toBe('F1');
  });

  it('갈래는 말(교류)로 고르고 값(AC)으로 싣는다 — 저장된 on 은 투입으로 읽힌다', () => {
    store.getState().updateCircuit('p', 2, { switch: 'on' });
    render(<EquipmentDetail equipmentId="p" onClose={vi.fn()} onDeleted={vi.fn()} />);
    openEditor();
    expect(screen.getAllByRole('button', { name: '개폐 고치기' })[1]).toHaveTextContent('투입');
    fireEvent.click(screen.getAllByRole('button', { name: '갈래 고치기' })[0]!);
    const select = screen.getByRole('combobox', { name: '갈래' });
    expect([...(select as HTMLSelectElement).options].map((o) => o.textContent)).not.toContain('직접 입력…');
    fireEvent.change(select, { target: { value: 'AC' } });
    expect(store.getState().overlays.circuits['circuit:p:1']?.current).toBe('AC');
    expect(buildCommitPayload(store.getState()).circuits?.updates).toContainEqual({ equipmentId: 'p', no: 1, patch: { current: 'AC' } });
    expect(screen.getAllByRole('button', { name: '갈래 고치기' })[0]).toHaveTextContent('교류');
  });

  it('편집 창의 연결 칸 — 이은 차단기는 부하 이름, 비면 잇기', () => {
    render(<EquipmentDetail equipmentId="p" onClose={vi.fn()} onDeleted={vi.fn()} />);
    openEditor();
    const dialog = screen.getByRole('dialog');
    expect(within(within(dialog).getByTestId('circuit-row-2')).getByText('부하')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button', { name: '잇기' })).toHaveLength(1);
  });

  it('마지막 차단기에 연결이 남아 있으면 지우지 않고 까닭을 말한다', () => {
    render(<EquipmentDetail equipmentId="p" onClose={vi.fn()} onDeleted={vi.fn()} />);
    openEditor();
    const before = store.getState().overlays;
    fireEvent.click(screen.getByRole('button', { name: '마지막 차단기 지우기' }));
    expect(screen.getByRole('alert')).toHaveTextContent('차단기 2 에 연결이 있어 지울 수 없습니다 — 연결을 먼저 지우세요');
    expect(store.getState().overlays).toBe(before);
    expect(store.getState().overlays.equipment.creates.p!.circuitCount).toBe(2);
  });

  it('마지막 차단기에 연결이 없으면 차단기 수가 하나 준다', () => {
    store.getState().update('equipment', 'p', { circuitCount: 3 });
    render(<EquipmentDetail equipmentId="p" onClose={vi.fn()} onDeleted={vi.fn()} />);
    openEditor();
    fireEvent.click(screen.getByRole('button', { name: '마지막 차단기 지우기' }));
    expect(store.getState().overlays.equipment.creates.p!.circuitCount).toBe(2);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('차단기 2')).toBeInTheDocument();
  });
});

describe('설비 상세', () => {
  it('이름은 다 친 뒤(blur) 한 번 오버레이에 실린다 — 치는 동안은 초안이다', () => {
    render(<EquipmentDetail equipmentId="l" onClose={vi.fn()} onDeleted={vi.fn()} />);
    const name = screen.getByLabelText('이름');
    fireEvent.change(name, { target: { value: '송' } });
    fireEvent.change(name, { target: { value: '송광치 ' } });
    expect(store.getState().overlays.equipment.creates.l!.name).toBe('부하');
    fireEvent.blur(name);
    expect(store.getState().overlays.equipment.creates.l!.name).toBe('송광치');
  });

  it('이름을 비우고 나가면 원래 이름으로 돌아간다 — 빈 이름은 변경안에 들지 않는다', () => {
    render(<EquipmentDetail equipmentId="l" onClose={vi.fn()} onDeleted={vi.fn()} />);
    const name = screen.getByLabelText('이름') as HTMLInputElement;
    fireEvent.change(name, { target: { value: '   ' } });
    fireEvent.blur(name);
    expect(store.getState().overlays.equipment.creates.l!.name).toBe('부하');
    expect(name.value).toBe('부하');
  });

  it('이름 고치기는 Enter 로도 커밋되고, 되돌리기 이력은 한 칸만 쌓인다', () => {
    render(<EquipmentDetail equipmentId="l" onClose={vi.fn()} onDeleted={vi.fn()} />);
    const before = store.temporal.getState().pastStates.length;
    const name = screen.getByLabelText('이름');
    name.focus();
    for (const v of ['송', '송광', '송광치']) fireEvent.change(name, { target: { value: v } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(store.getState().overlays.equipment.creates.l!.name).toBe('송광치');
    expect(store.temporal.getState().pastStates.length).toBe(before + 1);
  });

  it('제조년월은 YYYY-MM 글자 칸이다 — 날짜 고르기가 아니고, 친 그대로 싣는다', () => {
    render(<EquipmentDetail equipmentId="l" onClose={vi.fn()} onDeleted={vi.fn()} />);
    const made = screen.getByLabelText('제조년월') as HTMLInputElement;
    expect(made.type).not.toBe('date');
    expect(made).toHaveAttribute('placeholder', '예 2008-05');
    fireEvent.change(made, { target: { value: '2008-05' } });
    fireEvent.blur(made);
    expect(store.getState().overlays.equipment.creates.l!.madeOn).toBe('2008-05');
  });

  it('삭제는 함께 지워질 연결 수를 알리고 확인 뒤에 지운다', async () => {
    const onDeleted = vi.fn();
    render(<EquipmentDetail equipmentId="l" onClose={vi.fn()} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/연결 1건이 함께 지워집니다/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(store.getState().overlays.equipment.creates.l).toBeUndefined();
    expect(store.getState().overlays.links.creates.k).toBeUndefined();
  });

  it('슬롯 카드 — 이 설비를 단자로 가리키는 광선로가 「슬롯 n · 선로 · n심」, 남은 수는 「빈 슬롯」', () => {
    store.getState().update('equipment', 'p', { panelCount: 4 });
    store.getState().create('fiberLines', { id: 'L', cableTypeId: 'f', coreCount: 24, name: null, lengthKm: null, segments: [], aSubstationId: 'S1', aEquipmentId: 'p', aPanel: 2, aStartNo: 1, bSubstationId: 'S2', bEquipmentId: null, bPanel: null, bStartNo: 1, aSubstationName: '(구)춘천', bSubstationName: '화천', updatedAt: '' });
    render(<EquipmentDetail equipmentId="p" onClose={vi.fn()} onDeleted={vi.fn()} />);
    expect(screen.getByText('광선로 슬롯')).toBeInTheDocument();
    expect(screen.getByText('슬롯 2 · (구)춘천–화천 · 24심')).toBeInTheDocument();
    expect(screen.getByText('빈 슬롯 3')).toBeInTheDocument();
    expect(screen.queryByText(/판/)).toBeNull();
  });
});

describe('설비 상세 — 연결 목록', () => {
  /* 한 건의 줄 — 상대 끝 칸을 품은 목록 줄. */
  const linkRows = () => screen.getAllByTestId('link-far').map((e) => e.closest('.group') as HTMLElement);

  it('분전반에서 보면 첫 줄이 부하 설비 이름, 둘째 줄이 이쪽 차단기다', () => {
    render(<EquipmentDetail equipmentId="p" onClose={vi.fn()} onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /연결/ }));
    const [row] = linkRows();
    expect(within(row!).getByTestId('link-far')).toHaveTextContent(/^부하$/);
    expect(within(row!).getByTestId('link-near')).toHaveTextContent(/^이쪽: 차단기 2$/);
  });

  it('부하에서 보면 첫 줄이 분전반 차단기, 표기가 없으면 「이쪽」을 건너뛴다 — 케이블·길이만', () => {
    store.getState().update('links', 'k', { cableTypeId: 'fcv', lengthM: 12 });
    render(<EquipmentDetail equipmentId="l" onClose={vi.fn()} onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /연결/ }));
    const [row] = linkRows();
    expect(within(row!).getByTestId('link-far')).toHaveTextContent(/^분전반 P1 차단기 2$/);
    expect(within(row!).getByTestId('link-near')).toHaveTextContent(/^F-CV · 12 m$/);
    expect(row).not.toHaveTextContent('표기 없음');
    expect(screen.getByRole('button', { name: '잇기' })).toBeInTheDocument();
  });

  it('설비 끝의 표기는 줄에서 고친다 — 차단기 끝에는 표기 고치기가 없다', () => {
    render(<EquipmentDetail equipmentId="l" onClose={vi.fn()} onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /연결/ }));
    fireEvent.click(screen.getByRole('button', { name: '표기 고치기' }));
    const input = screen.getByRole('textbox', { name: '이쪽 표기' });
    fireEvent.change(input, { target: { value: 'AC IN' } });
    fireEvent.blur(input);
    expect(store.getState().overlays.links.creates.k!.b).toEqual({ kind: 'equipment', equipmentId: 'l', label: 'AC IN' });
    expect(within(linkRows()[0]!).getByTestId('link-near')).toHaveTextContent(/^이쪽: AC IN$/);
  });

  it('분전반(차단기 끝) 줄에는 표기 고치기가 없다', () => {
    render(<EquipmentDetail equipmentId="p" onClose={vi.fn()} onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /연결/ }));
    expect(screen.queryByRole('button', { name: '표기 고치기' })).toBeNull();
  });

  it('연결이 없으면 빈 안내, 지우면 오버레이에서 사라진다', () => {
    render(<EquipmentDetail equipmentId="l" onClose={vi.fn()} onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /연결/ }));
    fireEvent.click(screen.getByRole('button', { name: '연결 지우기' }));
    expect(screen.getByText('아직 연결이 없습니다')).toBeInTheDocument();
  });
});

describe('랙 상세', () => {
  const props = { rackId: 'r1', onClose: vi.fn(), onSelectEquipment: vi.fn(), onDeleted: vi.fn(), onAddEquipment: vi.fn() };

  it('랙 이름도 다 친 뒤 한 번, 비우면 원래 이름', () => {
    render(<RackDetail {...props} />);
    const name = screen.getByLabelText('이름') as HTMLInputElement;
    fireEvent.change(name, { target: { value: '' } });
    fireEvent.blur(name);
    expect(store.getState().overlays.racks.creates.r1!.name).toBe('분전반함');
    expect(name.value).toBe('분전반함');
    fireEvent.change(name, { target: { value: '통신랙' } });
    expect(store.getState().overlays.racks.creates.r1!.name).toBe('분전반함');
    fireEvent.blur(name);
    expect(store.getState().overlays.racks.creates.r1!.name).toBe('통신랙');
  });

  it('실장 설비를 누르면 그 설비를 고른다', () => {
    const onSelectEquipment = vi.fn();
    render(<RackDetail {...props} onSelectEquipment={onSelectEquipment} />);
    expect(screen.getByText('실장 설비 2')).toBeInTheDocument();
    expect(screen.queryByText(/안의 설비/)).toBeNull();
    fireEvent.click(screen.getByText('분전반 P1'));
    expect(onSelectEquipment).toHaveBeenCalledWith('p');
  });

  it('설비가 든 랙은 묻지 않고 까닭만 띄운다', () => {
    render(<RackDetail {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/랙 안에 설비가 2대/);
    expect(store.getState().overlays.racks.creates.r1).toBeDefined();
  });

  it('빈 랙은 확인한 뒤 지운다', async () => {
    store.getState().create('racks', { id: 'r2', substationId: 'S1', name: '빈 랙', rackTypeId: 'rt', floorId: null, x: null, y: null, width: null, height: null, facing: null, updatedAt: '' });
    const onDeleted = vi.fn();
    render(<RackDetail {...props} rackId="r2" onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(store.getState().overlays.racks.creates.r2).toBeUndefined();
  });
});
