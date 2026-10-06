import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { workingCopyStore as store } from '../../../model/store/workingCopy';
import { EquipmentDetail } from '../EquipmentDetail';
import { RackDetail } from '../RackDetail';

vi.mock('../../../model/hooks', () => ({
  useCatalog: () => ({ data: { categories: [], rackTypes: [], equipmentTypes: [], cableTypes: [], media: [] } }),
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

describe('설비 상세', () => {
  it('회로 표에 회로 1..N 이 선다', () => {
    render(<EquipmentDetail equipmentId="p" onClose={vi.fn()} onDeleted={vi.fn()} />);
    expect(screen.getAllByTestId('circuit-no').map((e) => e.textContent)).toEqual(['1', '2']);
  });

  it('회로 표기를 고치면 오버레이에 실린다', () => {
    render(<EquipmentDetail equipmentId="p" onClose={vi.fn()} onDeleted={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: '표기 고치기' })[0]!);
    const input = screen.getByRole('textbox', { name: '표기' });
    fireEvent.change(input, { target: { value: 'F1' } });
    fireEvent.blur(input);
    const patch = Object.entries(store.getState().overlays.circuits).find(([k]) => k.includes('p') && k.endsWith('1'));
    expect(patch?.[1].label).toBe('F1');
  });

  it('연결이 남은 회로를 잘라 내려 하면 회로 수가 그대로다', () => {
    render(<EquipmentDetail equipmentId="p" onClose={vi.fn()} onDeleted={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('회로 수'), { target: { value: '1' } });
    fireEvent.blur(screen.getByLabelText('회로 수'));
    expect(store.getState().overlays.equipment.creates.p!.circuitCount).toBe(2);
    expect(screen.getByText(/연결이 남은 회로 1개/)).toBeInTheDocument();
  });

  it('이름을 고치면 오버레이에 실린다', () => {
    render(<EquipmentDetail equipmentId="l" onClose={vi.fn()} onDeleted={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '송광치' } });
    expect(store.getState().overlays.equipment.creates.l!.name).toBe('송광치');
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

  it('연결 탭은 비어 있다(③)', () => {
    render(<EquipmentDetail equipmentId="l" onClose={vi.fn()} onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /연결/ }));
    expect(screen.getByText('아직 연결이 없습니다')).toBeInTheDocument();
  });
});

describe('랙 상세', () => {
  const props = { rackId: 'r1', onClose: vi.fn(), onSelectEquipment: vi.fn(), onDeleted: vi.fn(), onAddEquipment: vi.fn() };

  it('안의 설비를 누르면 그 설비를 고른다', () => {
    const onSelectEquipment = vi.fn();
    render(<RackDetail {...props} onSelectEquipment={onSelectEquipment} />);
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
